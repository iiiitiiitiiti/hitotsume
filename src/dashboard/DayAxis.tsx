import type { CSSProperties } from "react";
import type { CalendarEvent } from "../../helper/parse";
import { useNow } from "../useNow";
import { formatTime, formatUntil, layoutDay } from "./layout";
import { isArrayOf, isObj, str, useRemote, HELPER, type Remote } from "./useRemote";
import { HelperTrouble } from "./HelperTrouble";

const isEvent = (v: unknown): v is CalendarEvent => isObj(v) && str(v.subject) && str(v.start) && str(v.end);
const parseEvents = isArrayOf(isEvent);
const COLORS = ["c1", "c2", "c4", "c3"];

export function DayAxis() {
  const [calendar, reload] = useRemote(`${HELPER}/calendar`, 5 * 60_000, parseEvents);
  return <DayAxisView calendar={calendar} now={useNow(30_000)} onRetry={reload} />;
}

export function DayAxisView({ calendar, now, onRetry }: { calendar: Remote<CalendarEvent[]>; now: number; onRetry: () => void }) {
  const events = calendar.state === "ok" ? calendar.data : [];
  const l = layoutDay(events, now);
  const hours = Array.from({ length: l.endHour - l.startHour }, (_, i) => l.startHour + i);
  const lanes = Math.max(1, ...l.blocks.map((b) => b.lane + 1));
  const clock = new Date(now);
  const time = `${clock.getHours()}:${String(clock.getMinutes()).padStart(2, "0")}`;

  let status = "";
  if (calendar.state === "ok") {
    if (l.next) status = `次の「${l.next.event.subject}」まで ${formatUntil(l.next.minutes)}`;
    else if (l.current) status = `「${l.current.subject}」の途中`;
    else status = l.blocks.length > 0 ? "今日の予定はすべて終わりました" : "今日の予定はありません";
  }

  // 今の線の位置。軸の外の時刻なら端に寄せ、右寄りなら札を線の左に出す
  const nowAt = l.nowAt ?? (now < new Date(now).setHours(l.startHour, 0, 0, 0) ? 0 : 100);
  const flip = nowAt > 62;

  return (
    <section className="day" aria-labelledby="day-heading">
      <h2 id="day-heading" className="visually-hidden">
        今日の予定
      </h2>
      {l.allDay.length > 0 && (
        <ul className="day__allday" aria-label="終日の予定">
          {l.allDay.map((e, i) => (
            <li key={`${e.start}-${i}`}>{e.subject}</li>
          ))}
        </ul>
      )}
      <div className="day__scroll">
        <div className="day__body" style={{ "--lanes": lanes, "--hours": hours.length } as CSSProperties}>
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
          <div className={`now${flip ? " now--flip" : ""}${l.nowAt === null ? " now--off" : ""}`} style={{ left: `${nowAt}%` }}>
            <p className="now__label">
              <b className="num">{time}</b>
              {status && <span>{status}</span>}
            </p>
          </div>
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
          messages={{ not_running: "Outlook を開くと、今日の予定が出ます", read_failed: "Outlook から予定を読めませんでした" }}
        />
      )}
    </section>
  );
}
