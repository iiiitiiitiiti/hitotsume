export type Sky = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** Open-Meteo の天気コード（WMO）を、画面の言葉と絵に直す */
export function describeWeather(code: number): { text: string; sky: Sky } {
  if (code === 0) return { text: "晴れ", sky: "sun" };
  if (code === 1) return { text: "おおむね晴れ", sky: "sun" };
  if (code === 2) return { text: "晴れ時々くもり", sky: "partly" };
  if (code === 3) return { text: "くもり", sky: "cloud" };
  if (code === 45 || code === 48) return { text: "霧", sky: "fog" };
  if (code >= 51 && code <= 57) return { text: "霧雨", sky: "rain" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: code >= 65 && code !== 80 ? "強い雨" : "雨", sky: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: "雪", sky: "snow" };
  if (code >= 95) return { text: "雷雨", sky: "storm" };
  return { text: "—", sky: "cloud" };
}

export type Forecast = {
  now: number;
  today: Day;
  tomorrow: Day | null;
};

/** date はその地点の暦日（YYYY-MM-DD）。読めなければ空 */
export type Day = { date: string; code: number; max: number; min: number };

export function forecastUrl(latitude: number, longitude: number): string {
  const q = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "2",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseForecast(raw: unknown): Forecast | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as {
    current?: { temperature_2m?: unknown };
    daily?: { time?: unknown[]; weather_code?: unknown[]; temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[] };
  };
  const d = r.daily;
  const day = (i: number): Day | null => {
    const code = d?.weather_code?.[i];
    const max = d?.temperature_2m_max?.[i];
    const min = d?.temperature_2m_min?.[i];
    const time = d?.time?.[i];
    const date = typeof time === "string" && /^\d{4}-\d{2}-\d{2}$/.test(time) ? time : "";
    return num(code) && num(max) && num(min) ? { date, code, max: Math.round(max), min: Math.round(min) } : null;
  };
  const today = day(0);
  const now = r.current?.temperature_2m;
  if (!today || !num(now)) return null;
  return { now: Math.round(now), today, tomorrow: day(1) };
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 「11月6日（金）」。曜日は暦日から求める（地点の時差に左右されない） */
export function formatDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEK[d.getUTCDay()]}）`;
}

export type PlaceHit = { name: string; area: string; latitude: number; longitude: number };

/**
 * 地名検索は「札幌市」のような正式名でないと引けないので、市・都・府・県・区を付けた名前でも探す。
 * 付いた名前を先に並べる（「横浜」だけだと小さな集落が先に出るため）
 */
export function placeQueries(input: string): string[] {
  const q = input.trim();
  if (!q) return [];
  if (/[市都府県区町村]$/.test(q)) return [q];
  return [...["市", "都", "府", "県", "区"].map((s) => q + s), q];
}

/** 何通りかの検索結果をまとめ、同じ場所（座標がほぼ同じ）を1つにする */
export function mergeHits(lists: PlaceHit[][], limit = 6): PlaceHit[] {
  const seen = new Set<string>();
  const out: PlaceHit[] = [];
  for (const h of lists.flat()) {
    const key = `${h.latitude.toFixed(2)},${h.longitude.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

export function geocodeUrl(name: string): string {
  const q = new URLSearchParams({ name, count: "6", language: "ja", format: "json" });
  return `https://geocoding-api.open-meteo.com/v1/search?${q}`;
}

export function parseGeocode(raw: unknown): PlaceHit[] {
  const results = (raw as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: PlaceHit[] = [];
  for (const v of results) {
    const r = v as Record<string, unknown>;
    if (typeof r.name !== "string" || !num(r.latitude) || !num(r.longitude)) continue;
    // 同じ名前の地名を見分けるための都道府県（無ければ国）
    const area = [r.admin1, r.country].find((x): x is string => typeof x === "string" && x !== r.name) ?? "";
    out.push({ name: r.name, area, latitude: r.latitude, longitude: r.longitude });
  }
  return out;
}
