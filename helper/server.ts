// ひとつめの「係」。PC の中の情報（予定・Tech News・作問の種・note・Claude の使用量）を
// 127.0.0.1 だけで待ち受けて、ひとつめの画面にだけ JSON で渡す。
// 起動: node helper/server.ts（Node 24 の型の読み飛ばしで動く。依存パッケージなし）
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDay, parseNoteApi, parseNoteRss, parseSeeds, parseTechNews, parseTechNewsMore, pickDailyFile, toEvents, toUsage } from "./parse.ts";

export const PORT = 47615;
// 2: note を {order, items} で返す・/calendar に date を足した
const VERSION = "2";
// 手元の開発ページは HITOTSUME_DEV=1 のときだけ許す。ふだんは別プロジェクトの開発ページから読まれないようにする
const ALLOWED_ORIGINS = new Set([
  "https://iiiitiiitiiti.github.io",
  ...(process.env.HITOTSUME_DEV ? ["http://localhost:5173", "http://localhost:4173"] : []),
]);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const TECHNEWS_DIR = process.env.HITOTSUME_TECHNEWS_DIR ?? "G:\\マイドライブ\\Bookmarklet plug-in\\local\\docs\\technews";
const SEEDS_DIR = process.env.HITOTSUME_SEEDS_DIR ?? "G:\\マイドライブ\\クイズ\\Claude資料\\作問の種";
const CREDENTIALS = join(homedir(), ".claude", ".credentials.json");
const OUTLOOK_SCRIPT = fileURLToPath(new URL("./outlook-today.ps1", import.meta.url));

type Result = { ok: true; data: unknown; date?: string } | { ok: false; reason: string };

/** 端点ごとの控え。期限内なら控えを返し、取りに行っている最中の要求は同じ結果に相乗りさせる */
const cache = new Map<string, { at: number; value?: Result; pending?: Promise<Result> }>();
function cached(key: string, ttlMs: number, load: () => Promise<Result>): Promise<Result> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit?.value && now - hit.at < ttlMs) return Promise.resolve(hit.value);
  if (hit?.pending) return hit.pending;
  const pending = load()
    .catch((): Result => ({ ok: false, reason: "failed" }))
    .then((value) => {
      // 失敗は短く控えて、すぐ取り直せるようにする
      cache.set(key, { at: value.ok ? Date.now() : Date.now() - ttlMs + 30_000, value });
      return value;
    });
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value, pending });
  return pending;
}

function localDate(d = new Date()): string {
  return d.toLocaleDateString("sv-SE"); // YYYY-MM-DD（この PC の時刻で）
}

/** Outlook の読み取りは1本ずつ流す。日を続けて送られても PowerShell を同時に何本も起こさない */
let outlookQueue: Promise<unknown> = Promise.resolve();
function runOutlook(date: string): Promise<Result> {
  const run = outlookQueue.then(() => readOutlook(date));
  outlookQueue = run;
  return run;
}

function readOutlook(date: string): Promise<Result> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", OUTLOOK_SCRIPT, "-Date", date],
      { timeout: 20_000, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, reason: "read_failed" });
        try {
          const raw: unknown = JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "[]");
          if (raw && typeof raw === "object" && !Array.isArray(raw) && "error" in raw)
            return resolve({ ok: false, reason: String((raw as { error: unknown }).error) });
          resolve({ ok: true, data: toEvents(raw), date });
        } catch {
          resolve({ ok: false, reason: "read_failed" });
        }
      },
    );
  });
}

async function readDaily(dir: string): Promise<{ text: string; date: string } | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const pick = pickDailyFile(names, localDate());
  if (!pick) return null;
  return { text: await readFile(join(dir, pick.name), "utf8"), date: pick.date };
}

async function loadTechNews(): Promise<Result> {
  const f = await readDaily(TECHNEWS_DIR);
  if (!f) return { ok: false, reason: "no_file" };
  return { ok: true, data: { highlights: parseTechNews(f.text), more: parseTechNewsMore(f.text) }, date: f.date };
}

async function loadSeeds(): Promise<Result> {
  const f = await readDaily(SEEDS_DIR);
  if (!f) return { ok: false, reason: "no_file" };
  return { ok: true, data: parseSeeds(f.text), date: f.date };
}

/** タグの人気記事。人気順の窓口（非公式）が使えなければ、公式の RSS の新着に切り替える */
async function loadNote(tagName: string): Promise<Result> {
  const t = encodeURIComponent(tagName);
  const init = () => ({ headers: { "User-Agent": "hitotsume-helper/1" }, signal: AbortSignal.timeout(10_000) });
  try {
    const res = await fetch(`https://note.com/api/v3/hashtags/${t}/notes?order=hot&page=1`, init());
    if (res.ok) {
      const items = parseNoteApi(await res.json(), 5);
      if (items.length > 0) return { ok: true, data: { order: "hot", items } };
    }
  } catch {
    // RSS へ
  }
  const res = await fetch(`https://note.com/hashtag/${t}/rss`, init());
  if (!res.ok) return { ok: false, reason: "fetch_failed" };
  return { ok: true, data: { order: "new", items: parseNoteRss(await res.text(), 5) } };
}

/** Claude の使用量。この PC に保存済みのログインを読むだけで、書き換え・期限の延長はしない */
async function loadUsage(): Promise<Result> {
  let token: string | undefined;
  let expiresAt = 0;
  try {
    const cred = JSON.parse(await readFile(CREDENTIALS, "utf8")) as {
      claudeAiOauth?: { accessToken?: string; expiresAt?: number };
    };
    token = cred.claudeAiOauth?.accessToken;
    expiresAt = cred.claudeAiOauth?.expiresAt ?? 0;
  } catch {
    return { ok: false, reason: "no_login" };
  }
  if (!token) return { ok: false, reason: "no_login" };
  if (expiresAt && expiresAt < Date.now() + 60_000) return { ok: false, reason: "expired" };
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, reason: res.status === 401 ? "expired" : "fetch_failed" };
  const windows = toUsage(await res.json());
  if (windows.length === 0) return { ok: false, reason: "unknown_shape" };
  return { ok: true, data: windows };
}

const MIN = 60_000;

async function route(url: URL): Promise<{ status: number; body: Result | { ok: true; version: string } }> {
  switch (url.pathname) {
    case "/version":
      return { status: 200, body: { ok: true, version: VERSION } };
    case "/calendar": {
      const day = url.searchParams.get("date") ?? localDate();
      if (!checkDay(day, localDate())) return { status: 400, body: { ok: false, reason: "bad_date" } };
      return { status: 200, body: await cached(`calendar:${day}`, 5 * MIN, () => runOutlook(day)) };
    }
    case "/technews":
      return { status: 200, body: await cached("technews", 10 * MIN, loadTechNews) };
    case "/seeds":
      return { status: 200, body: await cached("seeds", 10 * MIN, loadSeeds) };
    case "/usage":
      return { status: 200, body: await cached("usage", 5 * MIN, loadUsage) };
    case "/note": {
      const t = (url.searchParams.get("tag") ?? "").trim().replace(/^#/, "");
      if (!t || t.length > 40 || /[/?#\\%]/.test(t)) return { status: 400, body: { ok: false, reason: "bad_tag" } };
      return { status: 200, body: await cached(`note:${t}`, 30 * MIN, () => loadNote(t)) };
    }
    default:
      return { status: 404, body: { ok: false, reason: "not_found" } };
  }
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function handle(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  // 何かをする前に、相手がひとつめの画面か・宛先がこの PC かを確かめる
  if (!ALLOWED_HOSTS.has(req.headers.host ?? "") || !origin || !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { ok: false, reason: "forbidden" });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
    return res.end();
  }
  if (req.method !== "GET") return send(res, 405, { ok: false, reason: "method" }, origin);
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  route(url)
    .then(({ status, body }) => send(res, status, body, origin))
    .catch(() => send(res, 500, { ok: false, reason: "failed" }, origin));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createServer(handle);
  server.on("error", (e: NodeJS.ErrnoException) => {
    // すでに別の係が動いていれば、こちらは何もせず終わる
    if (e.code === "EADDRINUSE") process.exit(0);
    throw e;
  });
  server.listen(PORT, "127.0.0.1");
}
