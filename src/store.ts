import type { AppData, DoneRecord, Draft, Task, Theme } from "./types";

export const STORAGE_KEY = "hitotsume:v1";
/** 読めなかった保存データの退避先（次の保存で上書きして消さないため） */
export const BACKUP_KEY = "hitotsume:unreadable-backup";
/** public/theme.js も同じキーを読む */
export const THEME_KEY = "hitotsume:theme";
/** 書きかけの文。タブごとに残したいので sessionStorage に置く */
export const DRAFT_KEY = "hitotsume:draft";
export const MAX_DONE = 500;
export const MAX_TEXT = 200;

export function emptyData(): AppData {
  return { version: 1, current: null, done: [] };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 改行と連続する空白を1つの空白にまとめ、前後の空白を落とし、長すぎる文を切る */
export function cleanText(input: string): string {
  return Array.from(input.replace(/\s+/g, " ").trim()).slice(0, MAX_TEXT).join("");
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function toTask(v: unknown): Task | null {
  if (!isObj(v)) return null;
  const { id, title, firstStep, createdAt } = v;
  if (!isText(id) || !isText(title) || !isText(firstStep) || !isTime(createdAt)) return null;
  return { id, title, firstStep, createdAt };
}

function toDone(v: unknown): DoneRecord | null {
  if (!isObj(v)) return null;
  const { id, title, doneAt } = v;
  if (!isText(id) || !isText(title) || !isTime(doneAt)) return null;
  return { id, title, doneAt };
}

/** 形が違えば null。済んだ記録は壊れた項目だけ捨てる */
export function parseData(raw: string): AppData | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.done)) return null;
  const current = v.current == null ? null : toTask(v.current);
  if (v.current != null && current === null) return null;
  const done = v.done.map(toDone).filter((d): d is DoneRecord => d !== null).slice(0, MAX_DONE);
  return { version: 1, current, done };
}

function storageOf(kind: "local" | "session"): Storage | null {
  try {
    const storage = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "hitotsume:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** 保存できないブラウザ（設定で止めている等）では null。そのときは画面の中だけで動かす */
export function localStore(): Storage | null {
  return storageOf("local");
}

export function loadData(storage: Storage | null = localStore()): AppData {
  if (!storage) return emptyData();
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyData();
  }
  if (raw === null) return emptyData();
  const data = parseData(raw);
  if (data) return data;
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // 退避できなくても起動は続ける
  }
  return emptyData();
}

export function saveData(data: AppData, storage: Storage | null = localStore()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadTheme(storage: Storage | null = localStore()): Theme {
  try {
    return storage?.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: Theme, storage: Storage | null = localStore()): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // 保存できなくても切り替え自体は効かせる
  }
}

const isMode = (v: unknown): v is Draft["mode"] => v === "start" || v === "next" || v === "edit";

export function loadDraft(storage: Storage | null = storageOf("session")): Draft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || !isMode(v.mode) || typeof v.title !== "string" || typeof v.firstStep !== "string") return null;
    const taskId = typeof v.taskId === "string" ? v.taskId : null;
    return { mode: v.mode, taskId, title: v.title, firstStep: v.firstStep };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft | null, storage: Storage | null = storageOf("session")): void {
  try {
    if (draft) storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
    else storage?.removeItem(DRAFT_KEY);
  } catch {
    // 書きかけが残らないだけなので無視する
  }
}

/** 書きかけの文があるか。あるうちはアプリの更新で再読み込みしない */
export function hasDraft(storage: Storage | null = storageOf("session")): boolean {
  const draft = loadDraft(storage);
  return draft !== null && (draft.title.trim() !== "" || draft.firstStep.trim() !== "");
}
