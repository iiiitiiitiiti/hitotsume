import { useState, type CSSProperties, type FormEvent } from "react";
import type { UsageWindow } from "../../helper/parse";
import { HelperTrouble } from "./HelperTrouble";
import { savePlace, type Place } from "./settings";
import { getJson, HELPER, isArrayOf, isObj, str, useRemote, type Remote } from "./useRemote";
import {
  describeWeather,
  geocodeUrl,
  mergeHits,
  parseGeocode,
  placeQueries,
  type Forecast,
  type PlaceHit,
  type Sky,
} from "./weather";

const isWindow = (v: unknown): v is UsageWindow => isObj(v) && str(v.label) && typeof v.percent === "number";
const parseWindows = isArrayOf(isWindow);
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function formatReset(iso: string | null, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  // 10:00 ちょうどの前後で 9:59 と出ないよう、分に丸める
  const d = new Date(Math.round(t / 60_000) * 60_000);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? `${time} に戻る` : `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）${time} に戻る`;
}

export function UsageBox() {
  const [usage, reload] = useRemote(`${HELPER}/usage`, 5 * 60_000, parseWindows);
  return (
    <section className="box" aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="box__heading">
        Claude の使用量
      </h2>
      {usage.state === "ok" && usage.data.length > 0 ? (
        <div className="gauges">
          {usage.data.slice(0, 3).map((u) => (
            <div key={u.label} className="gauge">
              <div
                className={`ring${u.percent >= 80 ? " ring--hot" : ""}`}
                style={{ "--p": Math.min(100, Math.max(0, u.percent)) } as CSSProperties}
                role="img"
                aria-label={`${u.label} ${u.percent}%使用`}
              >
                <p aria-hidden="true">
                  <b className="num">{u.percent}%</b>
                  <small>{u.label}</small>
                </p>
              </div>
              <p className="gauge__reset">{formatReset(u.resetsAt, Date.now())}</p>
            </div>
          ))}
        </div>
      ) : usage.state === "error" ? (
        <HelperTrouble reason={usage.reason} onRetry={reload} />
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </section>
  );
}

export function SkyIcon({ sky }: { sky: Sky }) {
  const sun = (
    <g>
      <circle cx="24" cy="24" r="9" fill="var(--c3)" />
      <g stroke="var(--c3)" strokeWidth="3" strokeLinecap="round">
        <path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5" />
      </g>
    </g>
  );
  const cloud = (x = 0, y = 0) => (
    <path
      transform={`translate(${x} ${y})`}
      d="M14 36h20a8 8 0 0 0 0-16 11 11 0 0 0-21-2 9 9 0 0 0 1 18Z"
      fill="var(--sky-cloud)"
    />
  );
  return (
    <svg className="sky" viewBox="0 0 48 48" aria-hidden="true">
      {sky === "sun" && sun}
      {sky === "partly" && (
        <>
          <g transform="translate(-6 -6) scale(.8)">{sun}</g>
          {cloud(2, 4)}
        </>
      )}
      {(sky === "cloud" || sky === "fog") && cloud(0, 0)}
      {sky === "fog" && <path d="M8 42h32M12 46h24" stroke="var(--sub)" strokeWidth="2.5" strokeLinecap="round" />}
      {(sky === "rain" || sky === "storm") && (
        <>
          {cloud(0, -4)}
          {sky === "rain" ? (
            <path d="M16 38l-2 6M25 38l-2 6M34 38l-2 6" stroke="var(--c1)" strokeWidth="3" strokeLinecap="round" />
          ) : (
            <path d="M26 34l-6 8h6l-4 6" fill="none" stroke="var(--c3)" strokeWidth="3" strokeLinejoin="round" />
          )}
        </>
      )}
      {sky === "snow" && (
        <>
          {cloud(0, -4)}
          <g fill="var(--c1)">
            <circle cx="16" cy="41" r="2.4" />
            <circle cx="25" cy="44" r="2.4" />
            <circle cx="34" cy="41" r="2.4" />
          </g>
        </>
      )}
    </svg>
  );
}

export function WeatherBox({
  place,
  forecast,
  onRetry,
  onPlace,
}: {
  place: Place;
  forecast: Remote<Forecast>;
  onRetry: () => void;
  onPlace: (p: Place) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <section className="box" aria-labelledby="weather-heading">
      <h2 id="weather-heading" className="box__heading">
        天気
        <button type="button" className="text-button" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          {place.name}
        </button>
      </h2>
      {picking ? (
        <PlacePicker
          onPick={(p) => {
            savePlace(p);
            onPlace(p);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : forecast.state === "ok" ? (
        <WeatherView f={forecast.data} />
      ) : forecast.state === "error" ? (
        <p className="trouble">
          <span>天気を取れませんでした</span>
          <button type="button" className="text-button" onClick={onRetry}>
            取り直す
          </button>
        </p>
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </section>
  );
}

function WeatherView({ f }: { f: Forecast }) {
  const today = describeWeather(f.today.code);
  const tomorrow = f.tomorrow && describeWeather(f.tomorrow.code);
  return (
    <div className="wx">
      <SkyIcon sky={today.sky} />
      <p className="wx__temp num">
        {f.today.max}°<small>{f.today.min}°</small>
      </p>
      <p className="wx__text">
        {today.text}
        <span className="wx__now">今 {f.now}°</span>
      </p>
      {f.tomorrow && tomorrow && (
        <p className="wx__tomorrow">
          明日 {tomorrow.text}
          <span className="num wx__range">
            {f.tomorrow.max}° / {f.tomorrow.min}°
          </span>
        </p>
      )}
    </div>
  );
}

function PlacePicker({ onPick, onCancel }: { onPick: (p: Place) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [error, setError] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const queries = placeQueries(text);
    if (queries.length === 0) return;
    setError(false);
    Promise.allSettled(queries.map((q) => getJson(geocodeUrl(q)).then(parseGeocode))).then((results) => {
      const lists = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (lists.length === 0) return setError(true);
      setHits(mergeHits(lists));
    });
  };

  return (
    <div className="picker">
      <form className="picker__form" onSubmit={search}>
        <label className="visually-hidden" htmlFor="place-input">
          地名
        </label>
        <input
          id="place-input"
          className="mini-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="地名（例: 横浜）"
          autoComplete="off"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <button type="submit" className="pill">
          探す
        </button>
      </form>
      {error && <p className="box__quiet">探せませんでした。少しおいてもう一度試してください</p>}
      {hits && hits.length === 0 && <p className="box__quiet">見つかりませんでした</p>}
      {hits && hits.length > 0 && (
        <ul className="picker__hits">
          {hits.map((h) => (
            <li key={`${h.latitude},${h.longitude}`}>
              <button
                type="button"
                className="picker__hit"
                onClick={() => onPick({ name: h.name, latitude: h.latitude, longitude: h.longitude })}
              >
                {h.name}
                {h.area && <small>{h.area}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
