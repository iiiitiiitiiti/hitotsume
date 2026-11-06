import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../helper/parse";
import { formatUntil, layoutDay, MAX_LANES } from "../src/dashboard/layout";

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 6 + dayOffset, h, m).getTime();
const ev = (subject: string, s: number, e: number, allDay = false): CalendarEvent => ({
  subject,
  start: new Date(s).toISOString(),
  end: new Date(e).toISOString(),
  allDay,
  location: "",
});

describe("layoutDay", () => {
  it("予定が無ければ 9〜19 時の軸で、次の予定は無い", () => {
    const l = layoutDay([], at(13, 5));
    expect([l.startHour, l.endHour]).toEqual([9, 19]);
    expect(l.blocks).toEqual([]);
    expect(l.next).toBeNull();
    expect(l.nowAt).toBeCloseTo(40.83, 1);
  });

  it("位置・過去・次の予定までの分", () => {
    const l = layoutDay([ev("朝会", at(10), at(10, 30)), ev("定例", at(13, 30), at(14, 30))], at(13, 5));
    const r = (n: number) => Math.round(n * 100) / 100;
    expect(l.blocks.map((b) => [b.event.subject, r(b.left), r(b.width), b.past])).toEqual([
      ["朝会", 10, 5, true],
      ["定例", 45, 10, false],
    ]);
    expect(l.next?.event.subject).toBe("定例");
    expect(l.next?.minutes).toBe(25);
  });

  it("早朝・夜の予定があれば軸を広げる", () => {
    const l = layoutDay([ev("早", at(7, 15), at(7, 30)), ev("夜", at(20), at(21, 30))], at(12));
    expect([l.startHour, l.endHour]).toEqual([7, 22]);
  });

  it("日をまたぐ予定は今日の分だけ。今日を覆う予定と終日は別にする", () => {
    const l = layoutDay(
      [
        ev("夜勤", at(22, 0, -1), at(9, 30)),
        ev("出張", at(0, 0, -1), at(0, 0, 2)),
        ev("休み", at(0), at(0, 0, 1), true),
        ev("昨日", at(10, 0, -1), at(11, 0, -1)),
      ],
      at(12),
    );
    expect(l.allDay.map((e) => e.subject)).toEqual(["出張", "休み"]);
    expect(l.blocks.map((b) => b.event.subject)).toEqual(["夜勤"]);
    expect(l.startHour).toBe(0);
    expect(l.blocks[0].left).toBe(0);
  });

  it("重なる予定は段を分け、段が足りなければ数える", () => {
    const same = Array.from({ length: MAX_LANES + 1 }, (_, i) => ev(`会${i}`, at(15), at(16)));
    const l = layoutDay([...same, ev("後", at(16), at(17))], at(12));
    expect(l.blocks.filter((b) => b.event.subject.startsWith("会")).map((b) => b.lane)).toEqual([0, 1, 2]);
    expect(l.hidden).toBe(1);
    expect(l.blocks.find((b) => b.event.subject === "後")?.lane).toBe(0);
  });

  it("進行中の予定を見分け、軸の外の時刻では今の位置を出さない", () => {
    const l = layoutDay([ev("会", at(13), at(14))], at(13, 30));
    expect(l.current?.subject).toBe("会");
    expect(l.blocks[0].now).toBe(true);
    expect(layoutDay([], at(23)).nowAt).toBeNull();
  });
});

describe("短い予定", () => {
  it("名前を外に出す印を付け、名前の分まで同じ段に入れない", () => {
    const l = layoutDay([ev("短", at(16), at(16, 15)), ev("すぐ後", at(16, 30), at(17, 30))], at(12));
    expect(l.blocks.map((b) => [b.event.subject, b.narrow, b.lane])).toEqual([
      ["短", true, 0],
      ["すぐ後", false, 1],
    ]);
  });
});

describe("formatUntil", () => {
  it("分と時間", () => {
    expect(formatUntil(25)).toBe("あと25分");
    expect(formatUntil(60)).toBe("あと1時間");
    expect(formatUntil(80)).toBe("あと1時間20分");
  });
});
