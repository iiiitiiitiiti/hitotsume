import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  cleanText,
  DRAFT_KEY,
  hasDraft,
  loadData,
  loadDraft,
  loadTheme,
  MAX_DONE,
  MAX_TEXT,
  parseData,
  saveData,
  saveDraft,
  STORAGE_KEY,
} from "../src/store";
import type { AppData } from "../src/types";

const sample = (): AppData => ({
  version: 1,
  current: { id: "t1", title: "見積もりを頼む🏠", firstStep: "サイトを開く", createdAt: 1 },
  done: [{ id: "t0", title: "前のこと", doneAt: 0 }],
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("cleanText", () => {
  it("改行と連続空白をまとめて前後を落とす", () => {
    expect(cleanText("  a\n\n b\t c  ")).toBe("a b c");
  });
  it("長すぎる文は文字数で切り、絵文字を壊さない", () => {
    const long = "😀".repeat(MAX_TEXT + 5);
    expect(Array.from(cleanText(long))).toHaveLength(MAX_TEXT);
    expect(cleanText(long).endsWith("😀")).toBe(true);
  });
});

describe("parseData", () => {
  it("保存→読み込みで元に戻る", () => {
    expect(parseData(JSON.stringify(sample()))).toEqual(sample());
  });
  it("壊れた JSON・違う版・壊れた current は null", () => {
    expect(parseData("{")).toBeNull();
    expect(parseData(JSON.stringify({ ...sample(), version: 2 }))).toBeNull();
    expect(parseData(JSON.stringify({ ...sample(), current: { id: "x", title: "" } }))).toBeNull();
  });
  it("壊れた済み記録だけ捨て、上限で切る", () => {
    const done = Array.from({ length: MAX_DONE + 3 }, (_, i) => ({ id: `d${i}`, title: "x", doneAt: i }));
    const raw = JSON.stringify({ ...sample(), done: [{ id: "bad" }, ...done] });
    const parsed = parseData(raw);
    expect(parsed?.done).toHaveLength(MAX_DONE);
    expect(parsed?.done[0].id).toBe("d0");
  });
});

describe("loadData / saveData", () => {
  it("何も無ければ空で始まる", () => {
    expect(loadData(localStorage)).toEqual({ version: 1, current: null, done: [] });
  });
  it("保存したものを読める", () => {
    expect(saveData(sample(), localStorage)).toBe(true);
    expect(loadData(localStorage)).toEqual(sample());
  });
  it("読めないデータは退避してから空で始める", () => {
    localStorage.setItem(STORAGE_KEY, "壊れた");
    expect(loadData(localStorage).current).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBe("壊れた");
  });
  it("保存先が無いときは空で始まり、保存は false", () => {
    expect(loadData(null).current).toBeNull();
    expect(saveData(sample(), null)).toBe(false);
  });
});

describe("theme", () => {
  it("既定はライト", () => {
    expect(loadTheme(localStorage)).toBe("light");
    localStorage.setItem("hitotsume:theme", "dark");
    expect(loadTheme(localStorage)).toBe("dark");
  });
});

describe("draft", () => {
  it("書きかけを残して読み戻せる。消すと無くなる", () => {
    saveDraft({ mode: "next", taskId: "t1", title: "", firstStep: "メールを開く" }, sessionStorage);
    expect(loadDraft(sessionStorage)).toEqual({ mode: "next", taskId: "t1", title: "", firstStep: "メールを開く" });
    expect(hasDraft(sessionStorage)).toBe(true);
    saveDraft(null, sessionStorage);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(hasDraft(sessionStorage)).toBe(false);
  });
  it("空白だけの書きかけは書きかけとみなさない", () => {
    saveDraft({ mode: "start", taskId: null, title: "  ", firstStep: "" }, sessionStorage);
    expect(hasDraft(sessionStorage)).toBe(false);
  });
});
