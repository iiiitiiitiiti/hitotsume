import { describe, expect, it } from "vitest";
import { checkDay, isPrTitle, isPublicUrl, keepNote, MAX_NOTE_TAGS, parseNoteApi, parseNoteTags, pickIcon, parseNoteRss, parseSeeds, parseTechNews, parseTechNewsMore, pickDailyFile, toEvents, toUsage } from "../helper/parse";

describe("pickDailyFile", () => {
  it("今日の分があればそれ、同日の再実行は番号の大きい方", () => {
    expect(pickDailyFile(["2026-11-05.md", "2026-11-06.md", "2026-11-06-2.md"], "2026-11-06")).toEqual({
      name: "2026-11-06-2.md",
      date: "2026-11-06",
    });
  });
  it("今日の分が無ければ前の日。未来の日付と関係ないファイルは見ない", () => {
    expect(pickDailyFile(["2026-11-04.md", "2026-11-07.md", "memo.md"], "2026-11-06")?.name).toBe("2026-11-04.md");
  });
  it("何も無ければ null", () => {
    expect(pickDailyFile(["README.md"], "2026-11-06")).toBeNull();
  });
});

describe("parseTechNews", () => {
  const md = [
    "# 2026-11-06",
    "",
    "## 今朝のハイライト",
    "",
    "1. **見出しA** — 要約A。 [OpenAI](https://openai.com/a)",
    "2. **見出しB** — 要約（括弧）B [Figma release notes](https://www.figma.com/release-notes/?title=x)",
    "",
    "## 1. AI・Claude 関連",
    "",
    "1. **別の節** — 出ない [X](https://x.com)",
  ].join("\r\n");
  it("ハイライトの節だけを読む", () => {
    expect(parseTechNews(md)).toEqual([
      { title: "見出しA", summary: "要約A。", source: "OpenAI", url: "https://openai.com/a" },
      {
        title: "見出しB",
        summary: "要約（括弧）B",
        source: "Figma release notes",
        url: "https://www.figma.com/release-notes/?title=x",
      },
    ]);
  });
  it("節が無ければ空", () => {
    expect(parseTechNews("# 2026-11-06\n本文")).toEqual([]);
  });
  it("ほかの節の記事は、ハイライトと重ならないものだけ", () => {
    const more = parseTechNewsMore(`${md}\r\n2. **重複** — 同じ [OpenAI](https://openai.com/a)`);
    expect(more.map((n) => n.title)).toEqual(["別の節"]);
  });
});

describe("parseSeeds", () => {
  const md = [
    "# 2026-11-06",
    "重点ジャンル: 芸術",
    "## 1. 考える人（大ジャンル: 芸術）",
    "- 事実: ロダンが構想した。",
    "- 出典: [ロダン美術館「The Thinker」](https://www.musee-rodin.fr/x)（強さ 1）",
    "- メモ: 使い方",
    "## 2. 事実なし（大ジャンル: 音楽）",
    "- メモ: だけ",
    "## 確認",
    "- 事実: これは種ではない",
  ].join("\n");
  it("名前・ジャンル・事実・出典を取り、事実の無い種と確認の節は捨てる", () => {
    expect(parseSeeds(md)).toEqual([
      {
        name: "考える人",
        genre: "芸術",
        fact: "ロダンが構想した。",
        sourceLabel: "ロダン美術館「The Thinker」",
        sourceUrl: "https://www.musee-rodin.fr/x",
      },
    ]);
  });
});

describe("parseNoteRss", () => {
  const xml = `<rss><channel><title>#デザイン</title>
    <item><title>A &amp; B の話</title><note:creatorName>加藤</note:creatorName><link>https://note.com/a/n/1</link></item>
    <item><title><![CDATA[C <D>]]></title><note:creatorName>佐藤</note:creatorName><link>https://note.com/b/n/2</link></item>
    <item><title>外のリンク</title><link>https://evil.example/</link></item>
  </channel></rss>`;
  it("記事を取り出し、note 以外のリンクは捨てる", () => {
    expect(parseNoteRss(xml)).toEqual([
      { title: "A & B の話", url: "https://note.com/a/n/1", author: "加藤", image: "" },
      { title: "C <D>", url: "https://note.com/b/n/2", author: "佐藤", image: "" },
    ]);
  });
  it("件数を絞れる", () => {
    expect(parseNoteRss(xml, 1)).toHaveLength(1);
  });
  it("サムネは note の画像置き場のものだけ通す", () => {
    const withThumb = `<item><title>T</title><link>https://note.com/a/n/1</link><media:thumbnail>https://assets.st-note.com/x.png?width=800</media:thumbnail></item>
      <item><title>U</title><link>https://note.com/a/n/2</link><media:thumbnail>https://evil.example/x.png</media:thumbnail></item>`;
    expect(parseNoteRss(withThumb).map((n) => n.image)).toEqual(["https://assets.st-note.com/x.png?width=800", ""]);
  });
});

describe("parseNoteApi", () => {
  const raw = {
    data: {
      notes: [
        { name: " 人気の記事 ", key: "n1f485eb3a258", eyecatch_url: "https://assets.st-note.com/a.png", user: { urlname: "huge_coot", nickname: "鳥" } },
        { name: "画像なし", key: "n2", eyecatch_url: null, user: { urlname: "b" } },
        { name: "鍵が変", key: "../x", user: { urlname: "c" } },
        { name: "名前が変", key: "n3", user: { urlname: "a/b" } },
        { name: "", key: "n4", user: { urlname: "d" } },
      ],
    },
  };
  it("記事の URL を組み立て、怪しい鍵や名前は捨てる", () => {
    expect(parseNoteApi(raw)).toEqual([
      { title: "人気の記事", url: "https://note.com/huge_coot/n/n1f485eb3a258", author: "鳥", image: "https://assets.st-note.com/a.png" },
      { title: "画像なし", url: "https://note.com/b/n/n2", author: "", image: "" },
    ]);
  });
  it("形が違えば空", () => {
    expect(parseNoteApi(null)).toEqual([]);
    expect(parseNoteApi({ data: {} })).toEqual([]);
  });
});

describe("note のふるい分け", () => {
  it("記事の詳しい情報からタグの名前を取り出す", () => {
    const raw = { data: { hashtag_notes: [{ hashtag: { name: "#デザイン" } }, { hashtag: null }, { hashtag: { name: "#UI" } }] } };
    expect(parseNoteTags(raw)).toEqual(["#デザイン", "#UI"]);
    expect(parseNoteTags({ data: {} })).toBeNull();
    expect(parseNoteTags(null)).toBeNull();
  });
  it("タグが多すぎる記事と PR の記事を外す", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`);
    expect(keepNote("企画の定義", ["#デザイン", "#企画", "#計画"])).toBe(true);
    expect(keepNote("ちょうど上限", tags(MAX_NOTE_TAGS))).toBe(true);
    expect(keepNote("付けすぎ", tags(MAX_NOTE_TAGS + 1))).toBe(false);
    expect(keepNote("写真をアニメ化", ["#デザイン", "#PR"])).toBe(false);
    expect(keepNote("【PR】サイト作成", ["#デザイン"])).toBe(false);
  });
  it("題名の PR は括弧つきか先頭のものだけ。言葉としての PR は残す", () => {
    expect(isPrTitle("［PR］新しい道具")).toBe(true);
    expect(isPrTitle("PR｜新商品")).toBe(true);
    expect(isPrTitle("デザインの PR 戦略")).toBe(false);
  });
});

describe("toUsage", () => {
  it("limits から週・全体と週・Fable を出す", () => {
    const raw = {
      five_hour: null,
      limits: [
        { kind: "weekly_scoped", group: "weekly", percent: 2, resets_at: "2026-11-10T01:00:00Z", scope: { model: { display_name: "Fable" } } },
        { kind: "weekly_all", group: "weekly", percent: 34.4, resets_at: "2026-11-10T01:00:00Z", scope: null },
      ],
    };
    expect(toUsage(raw)).toEqual([
      { label: "週・全体", percent: 34, resetsAt: "2026-11-10T01:00:00Z" },
      { label: "週・Fable", percent: 2, resetsAt: "2026-11-10T01:00:00Z" },
    ]);
  });
  it("5時間の枠が来たら先頭に出す", () => {
    const raw = {
      limits: [
        { kind: "weekly_all", group: "weekly", percent: 10, resets_at: null },
        { kind: "five_hour", group: "session", percent: 50, resets_at: "x" },
      ],
    };
    expect(toUsage(raw).map((u) => u.label)).toEqual(["5時間", "週・全体"]);
  });
  it("limits が無い古い形にも対応し、読めない形なら空", () => {
    expect(toUsage({ five_hour: { utilization: 42, resets_at: "a" }, seven_day: { utilization: 86, resets_at: "b" } })).toEqual([
      { label: "5時間", percent: 42, resetsAt: "a" },
      { label: "週・全体", percent: 86, resetsAt: "b" },
    ]);
    expect(toUsage("oops")).toEqual([]);
    expect(toUsage({ limits: [{ kind: "mystery", percent: 3 }] })).toEqual([]);
  });
});

describe("toEvents", () => {
  it("開始順に並べ、日時が読めないものは捨てる。1件だけでも配列にする", () => {
    const raw = [
      { subject: "B", start: "2026-11-06T15:00:00+09:00", end: "2026-11-06T16:00:00+09:00", allDay: false, location: "" },
      { subject: " ", start: "2026-11-06T10:00:00+09:00", end: "2026-11-06T10:30:00+09:00", allDay: false },
      { subject: "壊れ", start: "x", end: "y" },
    ];
    const ev = toEvents(raw);
    expect(ev.map((e) => e.subject)).toEqual(["（件名なし）", "B"]);
    expect(toEvents(raw[0])).toHaveLength(1);
    expect(toEvents(null)).toEqual([]);
  });
});

describe("checkDay", () => {
  it("暦にある日で、前後400日以内だけ通す", () => {
    expect(checkDay("2026-11-07", "2026-11-06")).toBe(true);
    expect(checkDay("2026-02-30", "2026-11-06")).toBe(false);
    expect(checkDay("2026-11-6", "2026-11-06")).toBe(false);
    expect(checkDay("2029-01-01", "2026-11-06")).toBe(false);
    expect(checkDay("-Command x", "2026-11-06")).toBe(false);
  });
});

describe("pickIcon", () => {
  it("ページが指定するアイコンを選び、相対パスを解く", () => {
    const maps = `<link href="//www.google.com/images/branding/product/ico/web_maps_icon_32dp.ico" rel="icon">`;
    expect(pickIcon(maps, "https://www.google.com/maps")).toBe("https://www.google.com/images/branding/product/ico/web_maps_icon_32dp.ico");
    expect(pickIcon(`<link rel='shortcut icon' href=/f.ico>`, "https://a.example/x/y")).toBe("https://a.example/f.ico");
  });
  it("SVG を先に、無ければ 32px 以上で一番小さいもの。mask-icon は使わない", () => {
    const sized = `<link rel="icon" href="/256.png" sizes="256x256"/><link rel="icon" href="/128.png" sizes="128x128"/><link rel="icon" href="/16.png" sizes="16x16"/>`;
    expect(pickIcon(sized, "https://f.example/")).toBe("https://f.example/128.png");
    const figma = `${sized}<link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml"/>`;
    expect(pickIcon(figma, "https://f.example/")).toBe("https://f.example/favicon.svg");
    const gh = `<link rel="mask-icon" href="/m.svg"><link rel="alternate icon" type="image/png" href="/f.png"><link rel="icon" type="image/svg+xml" href="/f.svg">`;
    expect(pickIcon(gh, "https://g.example/")).toBe("https://g.example/f.svg");
  });
  it("icon が無ければ apple-touch-icon、何も無ければ null。javascript: は捨てる", () => {
    expect(pickIcon(`<link rel="apple-touch-icon" href="/t.png">`, "https://t.example/")).toBe("https://t.example/t.png");
    expect(pickIcon(`<link rel="icon" href="javascript:alert(1)">`, "https://t.example/")).toBeNull();
    expect(pickIcon("<p>none</p>", "https://t.example/")).toBeNull();
  });
});

describe("isPublicUrl", () => {
  it("この PC や家の中のネットワークは通さない", () => {
    expect(isPublicUrl("https://mail.google.com/mail/u/0/")).toBe(true);
    for (const u of ["http://localhost:3000/", "http://127.0.0.1/", "http://192.168.1.1/", "http://10.0.0.2/", "http://[::1]/", "http://intranet/", "file:///C:/x", "nope"]) {
      expect(isPublicUrl(u)).toBe(false);
    }
  });
});
