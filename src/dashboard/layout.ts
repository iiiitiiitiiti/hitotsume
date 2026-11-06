import type { CalendarEvent } from "../../helper/parse";

export type Block = {
  event: CalendarEvent;
  /** 軸の左端からの位置と幅（%） */
  left: number;
  width: number;
  lane: number;
  past: boolean;
  now: boolean;
  /** 幅が狭く名前が入らない。名前は枠の右に出す */
  narrow: boolean;
  /** 枠の右に名前を出せる幅（軸に対する%）。この先は同じ段の次の予定がありうる */
  labelRoom: number;
};

export type DayLayout = {
  startHour: number;
  endHour: number;
  allDay: CalendarEvent[];
  blocks: Block[];
  /** 段が足りず軸に出せなかった件数 */
  hidden: number;
  /** 今の位置（%）。軸の外なら null */
  nowAt: number | null;
  next: { event: CalendarEvent; minutes: number } | null;
  current: CalendarEvent | null;
};

const HOUR = 3_600_000;
export const MAX_LANES = 3;
/** これより短い予定は名前を枠の外に出す。段を分けるときは名前の分まで場所を取る */
const NARROW_MS = 50 * 60_000;
const LABEL_MS = 80 * 60_000;

/**
 * 1日分の予定を、軸の上の位置に直す。軸は既定 9〜19 時で、はみ出す予定があれば広げる。
 * day はその日のどこかの時刻（省略すると今日）。済んだか・今かは now で決める
 */
export function layoutDay(events: CalendarEvent[], now: number, day = now): DayLayout {
  const day0 = new Date(day);
  day0.setHours(0, 0, 0, 0);
  const dayStart = day0.getTime();
  const dayEnd = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + 1).getTime();

  const allDay: CalendarEvent[] = [];
  const timed: { event: CalendarEvent; s: number; e: number }[] = [];
  for (const event of events) {
    const s = Date.parse(event.start);
    const e = Date.parse(event.end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= dayStart || s >= dayEnd) continue;
    // 終日の予定と、今日をまるごと覆う予定は軸の上に別に出す
    if (event.allDay || (s <= dayStart && e >= dayEnd)) allDay.push(event);
    else timed.push({ event, s: Math.max(s, dayStart), e: Math.min(Math.max(e, s + 1), dayEnd) });
  }
  timed.sort((a, b) => a.s - b.s || b.e - a.e);

  const hourOf = (t: number) => (t - dayStart) / HOUR;
  let startHour = 9;
  let endHour = 19;
  for (const t of timed) {
    startHour = Math.min(startHour, Math.floor(hourOf(t.s)));
    endHour = Math.max(endHour, Math.ceil(hourOf(t.e)));
  }
  startHour = Math.max(0, startHour);
  endHour = Math.min(24, endHour);
  const span = endHour - startHour;
  const pct = (t: number) => ((hourOf(t) - startHour) / span) * 100;

  // 重なる予定は段を分ける。空いている一番上の段に入れる
  const laneEnds: number[] = [];
  const blocks: Block[] = [];
  let hidden = 0;
  for (const t of timed) {
    let lane = laneEnds.findIndex((end) => end <= t.s);
    if (lane < 0) lane = laneEnds.length;
    if (lane >= MAX_LANES) {
      hidden += 1;
      continue;
    }
    const narrow = t.e - t.s < NARROW_MS;
    laneEnds[lane] = narrow ? Math.max(t.e, t.s + LABEL_MS) : t.e;
    blocks.push({
      event: t.event,
      left: pct(t.s),
      width: Math.max(pct(t.e) - pct(t.s), 0),
      lane,
      past: t.e <= now,
      now: t.s <= now && now < t.e,
      narrow,
      labelRoom: narrow ? Math.max(pct(t.s + LABEL_MS) - pct(t.e), 0) : 0,
    });
  }

  const nowPct = pct(now);
  const upcoming = timed.find((t) => t.s > now);
  const current = timed.find((t) => t.s <= now && now < t.e)?.event ?? null;
  return {
    startHour,
    endHour,
    allDay,
    blocks,
    hidden,
    nowAt: nowPct >= 0 && nowPct <= 100 ? nowPct : null,
    next: upcoming ? { event: upcoming.event, minutes: Math.ceil((upcoming.s - now) / 60_000) } : null,
    current,
  };
}

/** 「あと N分」「あと 1時間20分」 */
export function formatUntil(minutes: number): string {
  if (minutes < 60) return `あと${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `あと${h}時間` : `あと${h}時間${m}分`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
