import { describe, expect, it } from "vitest";
import { cleanTag, normalizeUrl, parseLinks, parsePlace, DEFAULT_PLACE } from "../src/dashboard/settings";
import { describeWeather, formatDay, mergeHits, parseForecast, parseGeocode, placeQueries } from "../src/dashboard/weather";

describe("normalizeUrl", () => {
  it("http・https だけを通し、書き忘れた https を補う", () => {
    expect(normalizeUrl("note.com")).toBe("https://note.com/");
    expect(normalizeUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,x")).toBeNull();
    expect(normalizeUrl("こんにちは")).toBeNull();
    expect(normalizeUrl("  ")).toBeNull();
  });
});

describe("parseLinks / parsePlace / cleanTag", () => {
  it("壊れた保存内容は捨てる・既定に戻す", () => {
    expect(parseLinks([{ id: "a", name: "A", url: "javascript:x" }, { id: "b", name: " ", url: "github.com" }, "x"])).toEqual([
      { id: "b", name: "github.com", url: "https://github.com/" },
    ]);
    expect(parseLinks(null)).toEqual([]);
    expect(parsePlace({ name: "札幌市", latitude: 43.06, longitude: 141.35 }).name).toBe("札幌市");
    expect(parsePlace({ name: "x", latitude: 999, longitude: 0 })).toBe(DEFAULT_PLACE);
    expect(parsePlace("x")).toBe(DEFAULT_PLACE);
  });
  it("タグは # を外し、URL を書き換えうる文字は通さない", () => {
    expect(cleanTag("#デザイン")).toBe("デザイン");
    expect(cleanTag("＃UI")).toBe("UI");
    expect(cleanTag("a/b")).toBeNull();
    expect(cleanTag("a?b")).toBeNull();
    expect(cleanTag("")).toBeNull();
  });
});

describe("天気", () => {
  it("天気コードを言葉にする", () => {
    expect(describeWeather(0)).toEqual({ text: "晴れ", sky: "sun" });
    expect(describeWeather(3).text).toBe("くもり");
    expect(describeWeather(63).sky).toBe("rain");
    expect(describeWeather(95).sky).toBe("storm");
  });
  it("予報を読み、欠けていれば null", () => {
    const raw = {
      current: { temperature_2m: 20.6 },
      daily: { time: ["2026-11-06", "bad"], weather_code: [3, 0], temperature_2m_max: [24.4, 19], temperature_2m_min: [13.5, 10] },
    };
    expect(parseForecast(raw)).toEqual({
      now: 21,
      today: { date: "2026-11-06", code: 3, max: 24, min: 14 },
      tomorrow: { date: "", code: 0, max: 19, min: 10 },
    });
    expect(parseForecast({ current: {}, daily: raw.daily })).toBeNull();
  });
  it("日付に曜日を添える", () => {
    expect(formatDay("2026-11-06")).toBe("11月6日（金）");
    expect(formatDay("2026-11-08")).toBe("11月8日（日）");
    expect(formatDay("")).toBe("");
  });
  it("地名は市・都などを付けた名前でも探し、同じ場所はまとめる", () => {
    expect(placeQueries("札幌")).toEqual(["札幌市", "札幌都", "札幌府", "札幌県", "札幌区", "札幌"]);
    expect(placeQueries("那覇市")).toEqual(["那覇市"]);
    expect(placeQueries(" ")).toEqual([]);
    const a = parseGeocode({ results: [{ name: "札幌市", admin1: "北海道", latitude: 43.06417, longitude: 141.34694 }] });
    const b = parseGeocode({ results: [{ name: "札幌", admin1: "北海道", latitude: 43.0642, longitude: 141.3469 }, { name: "x" }] });
    expect(mergeHits([a, b])).toEqual([{ name: "札幌市", area: "北海道", latitude: 43.06417, longitude: 141.34694 }]);
  });
});
