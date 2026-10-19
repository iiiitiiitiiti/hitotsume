import { useEffect, useState } from "react";

/** 今の時刻を intervalMs ごとに返す。タブが裏にある間は止め、表に戻ったらすぐ合わせる */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      setNow(Date.now());
      window.clearInterval(timer);
      timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else window.clearInterval(timer);
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return now;
}
