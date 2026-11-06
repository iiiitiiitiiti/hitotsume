import { useEffect, useState, type CSSProperties } from "react";
import type { CalendarEvent } from "../../helper/parse";
import { useNow } from "../useNow";
import { formatTime, formatUntil, layoutDay } from "./layout";
import { isArrayOf, isObj, str, useRemote, HELPER, type Remote } from "./useRemote";
import { HelperTrouble } from "./HelperTrouble";
import { formatDay } from "./weather";

const isEvent = (v: unknown): v is CalendarEvent => isObj(v) && str(v.subject) && str(v.start) && str(v.end);
const parseEvents = isArrayOf(isEvent);
const COLORS = ["c1", "c2", "c4", "c3"];

/** 今日から offset 日ずらした日の正午（時刻）と、その暦日 YYYY-MM-DD */
function shiftDay(now: number, offset: number): { at: number; date: string } {
  const d = new Date(now);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12).getTime();
  return { at, date: new Date(at).toLocaleDateString("sv-SE") };
}

/** 動かせるのは前後この日数まで */
const RANGE = 60;

export function DayAxis() {
  const now = useNow(30_000);
  const [offset, setOffset] = useState(0);
  const day = shiftDay(now, offset);
  // 続けて日を送ったときは、止まってから取りに行く（途中の日の分を係に読ませない）
  const [fetchDate, setFetchDate] = useState(day.date);
  useEffect(() => {
    const t = window.setTimeout(() => setFetchDate(day.date), 300);
    return () => window.clearTimeout(t);
  }, [day.date]);
  const [calendar, reload] = useRemote(`${HELPER}/calendar?date=${fetchDate}`, 5 * 60_000, parseEvents);
  // 日を切り替えた直後は、前の日の予定を新しい日の軸に描かない
  const shown: Remote<CalendarEvent[]> = calendar.state === "ok" && calendar.date !== day.date ? { state: "loading" } : calendar;
  return (
    <DayAxisView
      calendar={shown}
      now={now}
      day={day.at}
      dayLabel={formatDay(day.date)}
      offset={offset}
      onShift={(n) => setOffset((o) => Math.max(-RANGE, Math.min(RANGE, o + n)))}
      onToday={() => setOffset(0)}
      onRetry={reload}
    />
  );
}

const DAY_WORD: Record<string, string> = { "-1": "昨日", "0": "今日", "1": "明日" };

export function DayAxisView({
  calendar,
  now,
  day = now,
  dayLabel = "",
  offset = 0,
  onShift,
  onToday,
  onRetry,
}: {
  calendar: Remote<CalendarEvent[]>;
  now: number;
  day?: number;
  dayLabel?: string;
  offset?: number;
  onShift?: (n: number) => void;
  onToday?: () => void;
  onRetry: () => void;
}) {
  const isToday = offset === 0;
  const events = calendar.state === "ok" ? calendar.data : [];
  const l = layoutDay(events, now, day);
  const hours = Array.from({ length: l.endHour - l.startHour }, (_, i) => l.startHour + i);
  const lanes = Math.max(1, ...l.blocks.map((b) => b.lane + 1));
  const clock = new Date(now);
  const time = `${clock.getHours()}:${String(clock.getMinutes()).padStart(2, "0")}`;

  let status = "";
  let dayStatus = "";
  if (calendar.state === "ok") {
    if (l.next) status = `次の「${l.next.event.subject}」まで ${formatUntil(l.next.minutes)}`;
    else if (l.current) status = `「${l.current.subject}」の途中`;
    else status = l.blocks.length > 0 ? "今日の予定はすべて終わりました" : "今日の予定はありません";
    const count = l.blocks.length + l.allDay.length + l.hidden;
    dayStatus = count > 0 ? `予定 ${count}件` : "この日の予定はありません";
  } else if (calendar.state === "loading") {
    dayStatus = "読み込み中";
  }

  // 今の線の位置。軸の外の時刻なら端に寄せ、右寄りなら札を線の左に出す
  const nowAt = l.nowAt ?? (now < new Date(now).setHours(l.startHour, 0, 0, 0) ? 0 : 100);
  const flip = nowAt > 62;

  return (
    <section className="day" aria-labelledby="day-heading">
      <div className="day__nav">
        <button type="button" className="day__step" onClick={() => onShift?.(-1)} aria-label="前の日">
          <Chevron dir="left" />
        </button>
        <h2 id="day-heading" className="day__date" aria-live="polite">
          {DAY_WORD[String(offset)] && <b>{DAY_WORD[String(offset)]}</b>}
          {dayLabel}
          <span className="visually-hidden">の予定</span>
        </h2>
        <button type="button" className="day__step" onClick={() => onShift?.(1)} aria-label="次の日">
          <Chevron dir="right" />
        </button>
        {!isToday && (
          <>
            <button type="button" className="text-button" onClick={onToday}>
              今日に戻る
            </button>
            <p className="day__status">{dayStatus}</p>
          </>
        )}
      </div>
      {l.allDay.length > 0 && (
        <ul className="day__allday" aria-label="終日の予定">
          {l.allDay.map((e, i) => (
            <li key={`${e.start}-${i}`}>{e.subject}</li>
          ))}
        </ul>
      )}
      <div className="day__scroll">
        <div key={dayLabel} className="day__body" style={{ "--lanes": lanes, "--hours": hours.length } as CSSProperties}>
          <ol className="day__track" aria-label="時間の決まった予定">
            {l.blocks.map((b, i) => (
              <li
                key={`${b.event.start}-${i}`}
                className={`ev ${b.past ? "ev--past" : COLORS[i % COLORS.length]}${b.now ? " ev--now" : ""}${b.narrow ? " ev--narrow" : ""}`}
                style={
                  {
                    left: `${b.left}%`,
                    width: `${b.width}%`,
                    "--lane": b.lane,
                    "--i": i,
                    // 名前の幅は枠の幅に対する割合で渡す（枠の外に出すため）
                    "--room": b.width > 0 ? `${(b.labelRoom / b.width) * 100}%` : "120px",
                  } as CSSProperties
                }
                title={`${formatTime(b.event.start)}–${formatTime(b.event.end)} ${b.event.subject}`}
              >
                <span className="ev__label">
                  <span className="ev__name">{b.event.subject}</span>
                  <span className="ev__time num">
                    {formatTime(b.event.start)}–{formatTime(b.event.end)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {isToday && (
            <div className={`now${flip ? " now--flip" : ""}${l.nowAt === null ? " now--off" : ""}`} style={{ left: `${nowAt}%` }}>
              <p className="now__label">
                <b className="num">{time}</b>
                {status && <span>{status}</span>}
              </p>
            </div>
          )}
          <div className="day__ticks num" aria-hidden="true">
            {hours.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>
      </div>
      {l.hidden > 0 && <p className="day__more">重なっていて出せない予定がほかに{l.hidden}件あります</p>}
      {calendar.state === "error" && (
        <HelperTrouble
          reason={calendar.reason}
          onRetry={onRetry}
          messages={{ not_running: "Outlook を開くと、予定が出ます", read_failed: "Outlook から予定を読めませんでした" }}
        />
      )}
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
