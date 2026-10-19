import { useEffect, type CSSProperties } from "react";

const PARTICLES = 18;
const COLORS = ["var(--accent)", "var(--pop-1)", "var(--pop-2)", "var(--pop-3)"];

/** 済んだときの演出。画面全体に重ねるが、クリックや入力は下へ素通しする */
export function Celebration({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="celebration" aria-hidden="true">
      <div className="celebration__burst">
        {Array.from({ length: PARTICLES }, (_, i) => {
          const angle = (360 / PARTICLES) * i + (i % 2 ? 8 : -8);
          const distance = 120 + (i % 3) * 50;
          return (
            <span
              key={i}
              className="celebration__particle"
              style={
                {
                  "--angle": `${angle}deg`,
                  "--distance": `${distance}px`,
                  "--color": COLORS[i % COLORS.length],
                  "--delay": `${(i % 4) * 30}ms`,
                } as CSSProperties
              }
            />
          );
        })}
        <svg className="celebration__check" viewBox="0 0 120 120">
          <circle className="celebration__ring" cx="60" cy="60" r="52" />
          <path className="celebration__tick" d="M36 62 L54 80 L86 44" />
        </svg>
      </div>
    </div>
  );
}
