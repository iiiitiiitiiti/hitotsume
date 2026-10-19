import { describe, expect, it } from "vitest";
import { completeTask, countToday, editTask, nextStep, startTask, undoTo } from "../src/model";
import type { AppData } from "../src/types";

const empty = (): AppData => ({ version: 1, current: null, done: [] });

describe("startTask", () => {
  it("今やることと最初の一手を入れる（空白は整える）", () => {
    const next = startTask(empty(), { title: " 見積もり ", firstStep: "サイト\nを開く" }, "t1", 10);
    expect(next?.current).toEqual({ id: "t1", title: "見積もり", firstStep: "サイト を開く", createdAt: 10 });
  });
  it("ほかのタブで先に決まっていたら null", () => {
    const busy = startTask(empty(), { title: "a", firstStep: "b" }, "t1", 1)!;
    expect(startTask(busy, { title: "c", firstStep: "d" }, "t2", 2)).toBeNull();
  });
});

describe("nextStep / editTask", () => {
  const base = startTask(empty(), { title: "a", firstStep: "b" }, "t1", 1)!;
  it("一手を差し替える", () => {
    expect(nextStep(base, "t1", "c")?.current?.firstStep).toBe("c");
  });
  it("書き直す", () => {
    expect(editTask(base, "t1", { title: "x", firstStep: "y" })?.current).toMatchObject({ title: "x", firstStep: "y" });
  });
  it("別のタスクに変わっていたら null", () => {
    expect(nextStep(base, "other", "c")).toBeNull();
    expect(editTask(base, "other", { title: "x", firstStep: "y" })).toBeNull();
  });
});

describe("completeTask と undoTo", () => {
  const base = startTask(empty(), { title: "a", firstStep: "b" }, "t1", 1)!;
  it("済みにすると記録の先頭に入り、今やることは空になる", () => {
    const done = completeTask(base, "t1", 99)!;
    expect(done.current).toBeNull();
    expect(done.done[0]).toEqual({ id: "t1", title: "a", doneAt: 99 });
  });
  it("直後なら元に戻せる", () => {
    const done = completeTask(base, "t1", 99)!;
    expect(undoTo(done, { before: base, after: done })).toEqual(base);
  });
  it("ほかのタブで変わったあとは戻さない", () => {
    const done = completeTask(base, "t1", 99)!;
    const other = startTask(done, { title: "c", firstStep: "d" }, "t2", 100)!;
    expect(undoTo(other, { before: base, after: done })).toBeNull();
  });
});

describe("countToday", () => {
  it("端末の時刻で今日の分だけ数える", () => {
    const noon = new Date(2026, 9, 19, 12).getTime();
    const done = [
      { id: "a", title: "x", doneAt: new Date(2026, 9, 19, 0, 0).getTime() },
      { id: "b", title: "x", doneAt: new Date(2026, 9, 19, 23, 59).getTime() },
      { id: "c", title: "x", doneAt: new Date(2026, 9, 18, 23, 59).getTime() },
      { id: "d", title: "x", doneAt: new Date(2026, 9, 20, 0, 0).getTime() },
    ];
    expect(countToday(done, noon)).toBe(2);
  });
});
