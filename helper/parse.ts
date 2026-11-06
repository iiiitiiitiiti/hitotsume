// 係（helper/server.ts）が読み取ったものを、画面へ渡す形に直す純関数。

export type NewsItem = { title: string; summary: string; source: string; url: string };
export type Seed = { name: string; genre: string; fact: string; sourceLabel: string; sourceUrl: string };
export type NoteItem = { title: string; url: string; author: string; image: string };
export type UsageWindow = { label: string; percent: number; resetsAt: string | null };
export type CalendarEvent = {
  subject: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
};

/** 日別ファイル（YYYY-MM-DD.md、同日の再実行は YYYY-MM-DD-2.md）から、today 以前で一番新しいものを選ぶ */
export function pickDailyFile(names: string[], today: string): { name: string; date: string } | null {
  let best: { name: string; date: string; n: number } | null = null;
  for (const name of names) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/.exec(name);
    if (!m) continue;
    const date = m[1];
    const n = m[2] ? Number(m[2]) : 1;
    if (date > today) continue;
    if (!best || date > best.date || (date === best.date && n > best.n)) best = { name, date, n };
  }
  return best && { name: best.name, date: best.date };
}

/** 見出し（## 見出し）から次の ## までを返す */
function section(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

const NEWS_LINE = /^\d+\.\s+\*\*(.+?)\*\*\s*[—-]\s*(.*?)\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/;

function newsLines(text: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = NEWS_LINE.exec(line.trim());
    if (m) items.push({ title: m[1], summary: m[2], source: m[3], url: m[4] });
  }
  return items;
}

/** Tech News の「今朝のハイライト」。行の形は `1. **見出し** — 要約 [出典](URL)` */
export function parseTechNews(md: string): NewsItem[] {
  return newsLines(section(md, "今朝のハイライト"));
}

/** ハイライト以外の節の記事。ハイライトと同じ URL のものは除く */
export function parseTechNewsMore(md: string): NewsItem[] {
  const seen = new Set(parseTechNews(md).map((n) => n.url));
  const rest: string[] = [];
  let inHighlight = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inHighlight = line.trim() === "## 今朝のハイライト";
    else if (!inHighlight) rest.push(line);
  }
  const out: NewsItem[] = [];
  for (const n of newsLines(rest.join("\n"))) {
    if (seen.has(n.url)) continue;
    seen.add(n.url);
    out.push(n);
  }
  return out;
}

/** 作問の種。`## N. 名前（大ジャンル: X）` の下に `- 事実:` と `- 出典: [名前](URL)` */
export function parseSeeds(md: string): Seed[] {
  const seeds: Seed[] = [];
  let cur: Seed | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^##\s+\d+\.\s+(.+?)（大ジャンル[:：]\s*(.+?)）\s*$/.exec(line);
    if (head) {
      cur = { name: head[1], genre: head[2], fact: "", sourceLabel: "", sourceUrl: "" };
      seeds.push(cur);
      continue;
    }
    if (/^##\s/.test(line)) {
      cur = null;
      continue;
    }
    if (!cur) continue;
    const fact = /^-\s*事実[:：]\s*(.+)$/.exec(line);
    if (fact) cur.fact = fact[1];
    const src = /^-\s*出典[:：]\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(line);
    if (src) {
      cur.sourceLabel = src[1];
      cur.sourceUrl = src[2];
    }
  }
  return seeds.filter((s) => s.fact);
}

function decodeXml(s: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s.trim());
  if (cdata) return cdata[1].trim();
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decodeXml(m[1]) : "";
}

/** サムネは note の画像置き場のものだけ通す。ほかの場所の画像を記事の絵として出さないため */
function noteImage(url: unknown): string {
  return typeof url === "string" && /^https:\/\/assets\.st-note\.com\//.test(url) ? url : "";
}

/** note のタグ RSS（新着順）から記事を取り出す。人気順が取れないときの控え */
export function parseNoteRss(xml: string, limit = 5): NoteItem[] {
  const items: NoteItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const url = tag(m[1], "link");
    const title = tag(m[1], "title");
    if (!title || !/^https:\/\/note\.com\//.test(url)) continue;
    items.push({ title, url, author: tag(m[1], "note:creatorName"), image: noteImage(tag(m[1], "media:thumbnail")) });
    if (items.length >= limit) break;
  }
  return items;
}

type RawNote = { name?: unknown; key?: unknown; eyecatch_url?: unknown; user?: { urlname?: unknown; nickname?: unknown } | null };

/** note のタグの記事一覧（`/api/v3/hashtags/{タグ}/notes?order=hot`。タグページの「人気」に近い並び）を取り出す */
export function parseNoteApi(raw: unknown, limit = 5): NoteItem[] {
  const notes = (raw as { data?: { notes?: unknown } } | null)?.data?.notes;
  if (!Array.isArray(notes)) return [];
  const items: NoteItem[] = [];
  for (const n of notes as RawNote[]) {
    const user = n.user?.urlname;
    if (typeof n.name !== "string" || !n.name.trim()) continue;
    if (typeof n.key !== "string" || !/^n[0-9a-f]+$/.test(n.key)) continue;
    if (typeof user !== "string" || !/^[A-Za-z0-9_-]+$/.test(user)) continue;
    items.push({
      title: n.name.trim(),
      url: `https://note.com/${user}/n/${n.key}`,
      author: typeof n.user?.nickname === "string" ? n.user.nickname : "",
      image: noteImage(n.eyecatch_url),
    });
    if (items.length >= limit) break;
  }
  return items;
}

type RawLimit = {
  kind?: string;
  group?: string;
  percent?: number;
  resets_at?: string | null;
  scope?: { model?: { display_name?: string | null } | null } | null;
};
type RawWindow = { utilization?: number | null; resets_at?: string | null } | null;

/** Claude の使用量の応答を、画面に出す枠の一覧にする。形が変わっていたら空を返す */
export function toUsage(raw: unknown): UsageWindow[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { limits?: RawLimit[]; five_hour?: RawWindow; seven_day?: RawWindow };
  const out: UsageWindow[] = [];
  if (Array.isArray(r.limits) && r.limits.length > 0) {
    for (const l of r.limits) {
      if (typeof l.percent !== "number") continue;
      const model = l.scope?.model?.display_name;
      const kind = `${l.kind ?? ""} ${l.group ?? ""}`;
      let label: string;
      if (/five|session|5h/i.test(kind)) label = "5時間";
      else if (l.group === "weekly" && model) label = `週・${model}`;
      else if (l.kind === "weekly_all") label = "週・全体";
      else if (l.group === "weekly") label = "週";
      else continue;
      out.push({ label, percent: Math.round(l.percent), resetsAt: l.resets_at ?? null });
    }
    // 5時間の枠を先に、次に週・全体、最後にモデル別
    const rank = (u: UsageWindow) => (u.label === "5時間" ? 0 : u.label === "週・全体" ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b));
  }
  if (typeof r.five_hour?.utilization === "number")
    out.push({ label: "5時間", percent: Math.round(r.five_hour.utilization), resetsAt: r.five_hour.resets_at ?? null });
  if (typeof r.seven_day?.utilization === "number")
    out.push({ label: "週・全体", percent: Math.round(r.seven_day.utilization), resetsAt: r.seven_day.resets_at ?? null });
  return out;
}

type RawEvent = { subject?: unknown; start?: unknown; end?: unknown; allDay?: unknown; location?: unknown };

/** Outlook から読んだ予定を整え、開始の早い順に並べる。日時が読めないものは捨てる */
export function toEvents(raw: unknown): CalendarEvent[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const out: CalendarEvent[] = [];
  for (const e of list as RawEvent[]) {
    const start = typeof e.start === "string" ? new Date(e.start) : null;
    const end = typeof e.end === "string" ? new Date(e.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    out.push({
      subject: typeof e.subject === "string" && e.subject.trim() ? e.subject.trim() : "（件名なし）",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: e.allDay === true,
      location: typeof e.location === "string" ? e.location.trim() : "",
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** 予定を読む日の指定を確かめる。暦にある日で、今日から前後 400 日以内だけ通す */
export function checkDay(date: string, today: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m || !t) return false;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(d).toISOString().slice(0, 10) !== date) return false;
  const base = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
  return Math.abs(d - base) <= 400 * 86_400_000;
}
