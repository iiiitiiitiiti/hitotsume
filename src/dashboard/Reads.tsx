import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { NewsItem, NoteItem, Seed } from "../../helper/parse";
import { useFitLines, useFitList } from "./fit";
import { HelperTrouble } from "./HelperTrouble";
import { cleanTag, loadNoteTag, saveNoteTag } from "./settings";
import { getJson, HELPER, isArrayOf, isObj, str, useRemote } from "./useRemote";

const isNews = (v: unknown): v is NewsItem => isObj(v) && str(v.title) && str(v.url);
const newsList = isArrayOf(isNews);
const parseNews = (raw: unknown) =>
  isObj(raw) ? { highlights: newsList(raw.highlights) ?? [], more: newsList(raw.more) ?? [] } : null;
const parseSeeds = isArrayOf((v: unknown): v is Seed => isObj(v) && str(v.name) && str(v.fact));
const noteList = isArrayOf((v: unknown): v is NoteItem => isObj(v) && str(v.title) && str(v.url));
const parseNotes = (raw: unknown) => {
  // 古い係は記事の配列だけを返す（新着順）
  if (Array.isArray(raw)) {
    const items = noteList(raw);
    return items && { popular: false, items };
  }
  if (!isObj(raw)) return null;
  const items = noteList(raw.items);
  return items && { popular: raw.order === "hot", items };
};

/** 別のページは別窓で開く */
const OUT = { target: "_blank", rel: "noopener noreferrer" } as const;

/** サムネは画面の大きさに合う幅で取る（元の画像は 1280px ある） */
const thumb = (url: string) => (url.includes("?") ? url : `${url}?width=240`);

const TODAY = () => new Date().toLocaleDateString("sv-SE");

/** その日の分でなければ「11月5日の分」と添える */
function DateNote({ date }: { date?: string }) {
  if (!date || date === TODAY()) return null;
  const [, m, d] = date.split("-").map(Number);
  return <p className="read__date">{`${m}月${d}日の分`}</p>;
}

function Read({ id, title, tone, action, children }: { id: string; title: string; tone: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="read" style={{ "--k": `var(${tone})` } as CSSProperties} aria-labelledby={id}>
      <div className="read__head">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TechNews() {
  const [news, reload] = useRemote(`${HELPER}/technews`, 30 * 60_000, parseNews);
  const [open, setOpen] = useState(false);
  const more = news.state === "ok" ? news.data.more : [];
  const list = useFitList<HTMLOListElement>();
  return (
    <Read
      id="news-heading"
      title="Tech News"
      tone="--c1"
      action={
        more.length > 0 && (
          <button type="button" className="text-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "たたむ" : `ほか${more.length}件`}
          </button>
        )
      }
    >
      {news.state === "ok" ? (
        <>
          <DateNote date={news.date} />
          <ol ref={list} className={`read__list${open ? " read__list--open" : ""}`}>
            {[...news.data.highlights, ...(open ? more : [])].map((n, i) => (
              <li key={n.url} style={{ "--i": i } as CSSProperties}>
                <a href={n.url} {...OUT}>
                  <span className="read__title">{n.title}</span>
                  {n.summary && <span className="read__summary">{n.summary}</span>}
                  <small>{n.source}</small>
                </a>
              </li>
            ))}
          </ol>
        </>
      ) : news.state === "error" ? (
        <HelperTrouble reason={news.reason} onRetry={reload} messages={{ no_file: "まだ届いていません" }} />
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </Read>
  );
}

export function Seeds() {
  const [seeds, reload] = useRemote(`${HELPER}/seeds`, 30 * 60_000, parseSeeds);
  const [index, setIndex] = useState(0);
  const list = seeds.state === "ok" ? seeds.data : [];
  const seed = list.length > 0 ? list[index % list.length] : null;
  const body = useFitLines<HTMLDivElement>();
  return (
    <Read
      id="seeds-heading"
      title="作問の種"
      tone="--c3"
      action={
        list.length > 1 && (
          <button type="button" className="text-button" onClick={() => setIndex((i) => i + 1)}>
            次の種 <span className="num">{(index % list.length) + 1}/{list.length}</span>
          </button>
        )
      }
    >
      {seeds.state === "ok" && seed ? (
        <div key={index} className="read__swap">
          <DateNote date={seeds.date} />
          <p className="read__name">{seed.name}</p>
          <p className="read__genre">{seed.genre}</p>
          <div ref={body} className="read__fit">
            <p className="read__body">{seed.fact}</p>
          </div>
          {seed.sourceUrl && (
            <a className="read__source" href={seed.sourceUrl} {...OUT}>
              {seed.sourceLabel}
            </a>
          )}
        </div>
      ) : seeds.state === "error" ? (
        <HelperTrouble reason={seeds.reason} onRetry={reload} messages={{ no_file: "まだ届いていません" }} />
      ) : seeds.state === "ok" ? (
        <p className="box__quiet">今日の種はありません</p>
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </Read>
  );
}

type Article = { title: string; extract: string; url: string };

function parseArticle(raw: unknown): Article | null {
  if (!isObj(raw) || !str(raw.title) || !str(raw.extract)) return null;
  const urls = raw.content_urls as { desktop?: { page?: unknown } } | undefined;
  const url = urls?.desktop?.page;
  if (!str(url) || !url.startsWith("https://ja.wikipedia.org/")) return null;
  return { title: raw.title, extract: raw.extract, url };
}

export function Wikipedia() {
  const [article, setArticle] = useState<Article | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const body = useFitLines<HTMLDivElement>();
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    let alive = true;
    setState("loading");
    // 曖昧さ回避のページなど本文の短いものは引き直す（3回まで）
    const pull = async () => {
      for (let i = 0; i < 3; i += 1) {
        const a = parseArticle(await getJson("https://ja.wikipedia.org/api/rest_v1/page/random/summary"));
        if (a && a.extract.length >= 40) return a;
      }
      return null;
    };
    pull().then(
      (a) => {
        if (!alive) return;
        setArticle(a);
        setState(a ? "ok" : "error");
      },
      () => alive && setState("error"),
    );
    return () => {
      alive = false;
    };
  }, [seq]);

  return (
    <Read
      id="wiki-heading"
      title="Wikipedia"
      tone="--ink"
      action={
        // 引き直している間は今の記事を残し、ボタンの文字で知らせる。
        // disabled にすると押した直後にキーボードの位置が外れるので、押しても何もしないだけにする
        (article || state === "error") && (
          <button
            type="button"
            className="text-button"
            onClick={() => state !== "loading" && setSeq((n) => n + 1)}
            aria-disabled={state === "loading"}
          >
            {state === "loading" ? "読み込み中" : "別の記事"}
          </button>
        )
      }
    >
      {article && state !== "error" ? (
        <div key={article.url} className="read__swap">
          <a className="read__name" href={article.url} {...OUT}>
            {article.title}
          </a>
          <div ref={body} className="read__fit">
            <p className="read__body">{article.extract}</p>
          </div>
        </div>
      ) : state === "error" ? (
        <p className="box__quiet">記事を取れませんでした</p>
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </Read>
  );
}

export function Note() {
  const [tag, setTag] = useState(loadNoteTag);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tag);
  const [notes, reload] = useRemote(`${HELPER}/note?tag=${encodeURIComponent(tag)}`, 30 * 60_000, parseNotes);
  const list = useFitList<HTMLUListElement>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = cleanTag(text);
    if (!t) return;
    saveNoteTag(t);
    setTag(t);
    setEditing(false);
  };

  return (
    <Read
      id="note-heading"
      title={notes.state === "ok" && !notes.data.popular ? `note #${tag} の新着` : `note #${tag} の人気`}
      tone="--c2"
      action={
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setText(tag);
            setEditing((v) => !v);
          }}
          aria-expanded={editing}
        >
          タグを変える
        </button>
      }
    >
      {editing && (
        <form className="picker__form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="tag-input">
            タグ
          </label>
          <input
            id="tag-input"
            className="mini-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例: UIデザイン"
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button type="submit" className="pill" disabled={!cleanTag(text)}>
            変える
          </button>
        </form>
      )}
      {notes.state === "ok" ? (
        notes.data.items.length > 0 ? (
          <ul ref={list} className="read__list">
            {notes.data.items.slice(0, 3).map((n, i) => (
              <li key={n.url} style={{ "--i": i } as CSSProperties}>
                <a className="note-card" href={n.url} {...OUT}>
                  {n.image ? (
                    <img className="note-card__thumb" src={thumb(n.image)} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="note-card__thumb note-card__thumb--none" aria-hidden="true" />
                  )}
                  <span>
                    <span className="read__title">{n.title}</span>
                    {n.author && <small>{n.author}</small>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="box__quiet">このタグの記事はまだありません</p>
        )
      ) : notes.state === "error" ? (
        <HelperTrouble reason={notes.reason} onRetry={reload} />
      ) : (
        <p className="box__quiet">読み込み中</p>
      )}
    </Read>
  );
}
