import { cleanText, MAX_DONE } from "./store";
import type { AppData, DoneRecord } from "./types";

/*
 * 状態を変える操作。どれも保存済みの最新データを受け取り、新しいデータを返す。
 * null は「ほかのタブで先に変わっていて、この操作の前提が崩れた」ことを表す。
 * 空欄のような入力の誤りは画面側で先に弾く。
 */

export type TaskInput = { title: string; firstStep: string };

export function startTask(data: AppData, input: TaskInput, id: string, now: number): AppData | null {
  if (data.current) return null;
  const title = cleanText(input.title);
  const firstStep = cleanText(input.firstStep);
  if (!title || !firstStep) return null;
  return { ...data, current: { id, title, firstStep, createdAt: now } };
}

export function nextStep(data: AppData, taskId: string, firstStep: string): AppData | null {
  const step = cleanText(firstStep);
  if (!data.current || data.current.id !== taskId || !step) return null;
  return { ...data, current: { ...data.current, firstStep: step } };
}

export function editTask(data: AppData, taskId: string, input: TaskInput): AppData | null {
  const title = cleanText(input.title);
  const firstStep = cleanText(input.firstStep);
  if (!data.current || data.current.id !== taskId || !title || !firstStep) return null;
  return { ...data, current: { ...data.current, title, firstStep } };
}

export function completeTask(data: AppData, taskId: string, now: number): AppData | null {
  if (!data.current || data.current.id !== taskId) return null;
  const record: DoneRecord = { id: data.current.id, title: data.current.title, doneAt: now };
  return { ...data, current: null, done: [record, ...data.done].slice(0, MAX_DONE) };
}

export function sameData(a: AppData, b: AppData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type UndoEntry = { before: AppData; after: AppData };

/** 保存中のデータが自分の操作の直後のままなら、操作の前に戻す。ほかのタブで変わっていたら null */
export function undoTo(latest: AppData, entry: UndoEntry): AppData | null {
  return sameData(latest, entry.after) ? entry.before : null;
}

/** その日（端末の時刻で0時〜24時）に済ませた件数 */
export function countToday(done: DoneRecord[], now: number): number {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return done.filter((r) => r.doneAt >= start && r.doneAt < end).length;
}
