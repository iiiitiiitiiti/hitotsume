import { cleanText } from "../store";

export const LINKS_KEY = "hitotsume:links";
export const PLACE_KEY = "hitotsume:weather";
export const NOTE_TAG_KEY = "hitotsume:noteTag";

export type Link = { id: string; name: string; url: string };
export type Place = { name: string; latitude: number; longitude: number };

export const DEFAULT_PLACE: Place = { name: "東京", latitude: 35.6895, longitude: 139.6917 };
export const DEFAULT_NOTE_TAG = "デザイン";
export const MAX_LINKS = 12;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** http・https の URL だけを通す。「example.com」のように書かれたら https を補う */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function parseLinks(raw: unknown): Link[] {
  if (!Array.isArray(raw)) return [];
  const out: Link[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const { id, name, url } = v as Record<string, unknown>;
    const safe = typeof url === "string" ? normalizeUrl(url) : null;
    if (typeof id !== "string" || typeof name !== "string" || !safe) continue;
    out.push({ id, name: cleanText(name) || new URL(safe).hostname, url: safe });
  }
  return out.slice(0, MAX_LINKS);
}

export const loadLinks = () => parseLinks(read(LINKS_KEY));
export const saveLinks = (links: Link[]) => write(LINKS_KEY, links);

export function parsePlace(raw: unknown): Place {
  if (!raw || typeof raw !== "object") return DEFAULT_PLACE;
  const { name, latitude, longitude } = raw as Record<string, unknown>;
  if (typeof name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") return DEFAULT_PLACE;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return DEFAULT_PLACE;
  return { name: cleanText(name) || DEFAULT_PLACE.name, latitude, longitude };
}

export const loadPlace = () => parsePlace(read(PLACE_KEY));
export const savePlace = (p: Place) => write(PLACE_KEY, p);

/** note のタグ。先頭の # は外し、URL を書き換えうる文字を含むものは通さない */
export function cleanTag(input: string): string | null {
  const t = cleanText(input).replace(/^[#＃]/, "").trim();
  if (!t || t.length > 40 || /[/?#\\%]/.test(t)) return null;
  return t;
}

export function loadNoteTag(): string {
  const raw = read(NOTE_TAG_KEY);
  return (typeof raw === "string" && cleanTag(raw)) || DEFAULT_NOTE_TAG;
}
export const saveNoteTag = (tag: string) => write(NOTE_TAG_KEY, tag);
