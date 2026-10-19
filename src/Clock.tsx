import { useNow } from "./useNow";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function formatClock(now: number): { date: string; time: string } {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`, time: `${hh}:${mm}` };
}

export function Clock() {
  const { date, time } = formatClock(useNow(1000));
  return (
    <p className="clock">
      <span className="clock__date">{date}</span>
      <span className="clock__time">{time}</span>
    </p>
  );
}
