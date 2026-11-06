import { useEffect, useRef, useState, type FormEvent } from "react";
import { cleanText, newId } from "../store";
import { loadLinks, LINKS_KEY, MAX_LINKS, normalizeUrl, saveLinks, type Link } from "./settings";

/**
 * サイト自身のファビコン（/favicon.ico、無ければ /apple-touch-icon.png）を出す。
 * どちらも無ければ名前の頭文字にする。どれも同じ大きさの枠に収める
 */
function Favicon({ url, name }: { url: string; name: string }) {
  const [stage, setStage] = useState(0);
  const { origin } = new URL(url);
  const sources = [`${origin}/favicon.ico`, `${origin}/apple-touch-icon.png`];
  if (stage >= sources.length) {
    return <span className="link__icon link__initial">{Array.from(name)[0]?.toUpperCase() ?? "?"}</span>;
  }
  return (
    <img
      className="link__icon"
      src={sources[stage]}
      alt=""
      width={20}
      height={20}
      onLoad={(e) => {
        // 1px の透明画像などを返すサイトは、無いものとして次へ
        if (e.currentTarget.naturalWidth < 8) setStage((n) => n + 1);
      }}
      onError={() => setStage((n) => n + 1)}
    />
  );
}

export function Links() {
  const [links, setLinks] = useState<Link[]>(loadLinks);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // ほかのタブで足した・消したものを映す
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LINKS_KEY || e.key === null) setLinks(loadLinks());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (next: Link[]) => {
    setLinks(next);
    if (!saveLinks(next)) setError("保存できませんでした");
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const safe = normalizeUrl(url);
    if (!safe) return setError("http か https で始まるアドレスを入れてください");
    if (links.length >= MAX_LINKS) return setError(`${MAX_LINKS}件までです。どれかを消してください`);
    const label = cleanText(name) || new URL(safe).hostname.replace(/^www\./, "");
    update([...loadLinks(), { id: newId(), name: label, url: safe }]);
    setName("");
    setUrl("");
    setError("");
    document.getElementById("link-name")?.focus();
  };

  const remove = (id: string) => update(loadLinks().filter((l) => l.id !== id));

  const close = () => {
    setOpen(false);
    setError("");
    toggle.current?.focus();
  };

  return (
    <div className="links">
      <nav aria-label="よく見るサイト">
        <ul className="links__list">
          {links.map((l) => (
            <li key={l.id}>
              <a className="link" href={l.url} title={l.name} target="_blank" rel="noopener noreferrer">
                <Favicon url={l.url} name={l.name} />
                <span className="visually-hidden">{l.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <button
        ref={toggle}
        type="button"
        className={`link link--add${links.length === 0 ? " link--wide" : ""}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls="links-panel"
        aria-label="よく見るサイトを足す・消す"
      >
        ＋{links.length === 0 && <span>よく見るサイトを足す</span>}
      </button>
      {open && (
        <div
          id="links-panel"
          ref={panel}
          className="links__panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <form className="links__form" onSubmit={add} noValidate>
            <label htmlFor="link-name">名前</label>
            <input id="link-name" className="mini-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: Figma" autoComplete="off" autoFocus />
            <label htmlFor="link-url">アドレス</label>
            <input
              id="link-url"
              className="mini-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.figma.com/"
              inputMode="url"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
            />
            <button type="submit" className="pill pill--go">
              足す
            </button>
          </form>
          {error && <p className="field__error">{error}</p>}
          {links.length > 0 && (
            <ul className="links__manage">
              {links.map((l) => (
                <li key={l.id}>
                  <Favicon url={l.url} name={l.name} />
                  <span className="links__name">{l.name}</span>
                  <button type="button" className="text-button" onClick={() => remove(l.id)} aria-label={`${l.name}を消す`}>
                    消す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="text-button links__close" onClick={close}>
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
