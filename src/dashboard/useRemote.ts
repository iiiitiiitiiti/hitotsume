import { useCallback, useEffect, useRef, useState } from "react";

export const HELPER = "http://127.0.0.1:47615";

/** 係につながったか・つながらないかを画面全体へ知らせる。案内を1か所にまとめるため */
const STATUS_EVENT = "hitotsume:helper-status";
const RETRY_EVENT = "hitotsume:helper-retry";

export function reportHelper(up: boolean) {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: up }));
}

export function retryHelper() {
  window.dispatchEvent(new Event(RETRY_EVENT));
}

/** 係につながらないとき true */
export function useHelperDown(): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDown(!(e as CustomEvent<boolean>).detail);
    window.addEventListener(STATUS_EVENT, on);
    return () => window.removeEventListener(STATUS_EVENT, on);
  }, []);
  return down;
}

export type Remote<T> =
  | { state: "loading" }
  | { state: "ok"; data: T; date?: string }
  /** offline: 係につながらない（止まっている・ブラウザが許可していない）。reason: 係が理由を返した */
  | { state: "error"; reason: string };

type Envelope = { ok: true; data: unknown; date?: string } | { ok: false; reason: string };

/** 係の端点（/calendar など）か、ほかの URL から JSON を取る。取れた形は parse で確かめる */
export async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok && res.status !== 400) throw new Error(String(res.status));
  return res.json();
}

/**
 * url から定期的に取り直す。タブが裏の間は取らず、表に戻ったとき古ければ取り直す。
 * helper が true なら係の決まった包み（{ok, data}）として読む。
 */
export function useRemote<T>(
  url: string | null,
  intervalMs: number,
  parse: (raw: unknown) => T | null,
  helper = true,
): [Remote<T>, () => void] {
  const [value, setValue] = useState<Remote<T>>({ state: "loading" });
  const fetchedAt = useRef(0);
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let ctrl: AbortController | null = null;
    const load = () => {
      ctrl?.abort();
      ctrl = new AbortController();
      getJson(url, ctrl.signal).then(
        (raw) => {
          if (!alive) return;
          fetchedAt.current = Date.now();
          if (helper) {
            reportHelper(true);
            const env = raw as Envelope;
            if (!env || typeof env !== "object" || !("ok" in env)) return setValue({ state: "error", reason: "shape" });
            if (!env.ok) return setValue({ state: "error", reason: env.reason });
            const data = parseRef.current(env.data);
            setValue(data === null ? { state: "error", reason: "shape" } : { state: "ok", data, date: env.date });
          } else {
            const data = parseRef.current(raw);
            setValue(data === null ? { state: "error", reason: "shape" } : { state: "ok", data });
          }
        },
        (e: unknown) => {
          if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
          if (helper) reportHelper(false);
          setValue({ state: "error", reason: "offline" });
        },
      );
    };
    if (document.visibilityState === "visible") load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    const onVisible = () => {
      // 新しいタブを開き直すたびに取り直さないよう、1分以内なら控えのまま
      if (document.visibilityState === "visible" && Date.now() - fetchedAt.current > 60_000) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onRetry = () => helper && load();
    window.addEventListener(RETRY_EVENT, onRetry);
    return () => {
      alive = false;
      ctrl?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(RETRY_EVENT, onRetry);
    };
  }, [url, intervalMs, helper, tick]);

  return [value, reload];
}

export const isArrayOf =
  <T>(check: (v: unknown) => v is T) =>
  (raw: unknown): T[] | null =>
    Array.isArray(raw) ? raw.filter(check) : null;

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
export const str = (v: unknown): v is string => typeof v === "string";
