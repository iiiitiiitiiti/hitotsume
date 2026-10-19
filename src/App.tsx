import { useCallback, useEffect, useRef, useState } from "react";
import { Celebration } from "./Celebration";
import { Clock } from "./Clock";
import { completeTask, countToday, editTask, nextStep, sameData, startTask, undoTo, type UndoEntry } from "./model";
import {
  loadData,
  loadDraft,
  loadTheme,
  localStore,
  newId,
  saveData,
  saveDraft,
  saveTheme,
  STORAGE_KEY,
  THEME_KEY,
} from "./store";
import { STEP_FIELD, TaskForm, TITLE_FIELD } from "./TaskForm";
import type { AppData, Draft, Theme } from "./types";
import { useNow } from "./useNow";

const storage = localStore();

const NEXT_BUTTON = "button-next";
const EDIT_BUTTON = "button-edit";
const TOAST_MS = 8000;
const THEME_COLOR: Record<Theme, string> = { light: "#FAF8F3", dark: "#121212" };

type Toast = { id: number; text: string; undo?: UndoEntry };

const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

export function App() {
  const [data, setData] = useState<AppData>(() => loadData(storage));
  /** 保存できないブラウザでは、これが最新のデータになる */
  const memory = useRef(data);
  const [draft, setDraftState] = useState<Draft | null>(() => loadDraft());
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastPaused, setToastPaused] = useState(false);
  const toastSeq = useRef(0);
  const [celebration, setCelebration] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => loadTheme(storage));
  // 日付が変わったら「今日済んだこと」を数え直すため、毎分描き直す
  useNow(60_000);

  const current = data.current;
  const mode: Draft["mode"] | "view" = !current
    ? "start"
    : draft && draft.mode !== "start" && draft.taskId === current.id
      ? draft.mode
      : "view";
  const formTitle = draft && draft.mode === mode ? draft.title : "";
  const formStep = draft && draft.mode === mode ? draft.firstStep : "";

  const readLatest = () => (storage ? loadData(storage) : memory.current);

  const show = (next: Omit<Toast, "id">) => {
    toastSeq.current += 1;
    setToastPaused(false);
    setToast({ id: toastSeq.current, ...next });
  };

  const setDraft = (next: Draft | null) => {
    setDraftState(next);
    saveDraft(next);
  };

  const commit = (next: AppData) => {
    memory.current = next;
    setData(next);
    if (storage && !saveData(next, storage)) show({ text: "保存できませんでした。ブラウザの空き容量を確かめてください" });
  };

  /** 最新のデータに操作を当てる。ほかのタブで前提が変わっていたら何もせず最新を映す */
  const apply = (run: (latest: AppData) => AppData | null, text: string, focusId: string, celebrate = false) => {
    const before = readLatest();
    const after = run(before);
    setDraft(null);
    if (!after) {
      memory.current = before;
      setData(before);
      show({ text: "ほかのタブで変わったので、最新の内容を表示しました" });
      return;
    }
    commit(after);
    show({ text, undo: { before, after } });
    if (celebrate) setCelebration((n) => n + 1);
    focusLater(focusId);
  };

  const undo = () => {
    if (!toast?.undo) return;
    const latest = readLatest();
    const restored = undoTo(latest, toast.undo);
    if (!restored) {
      memory.current = latest;
      setData(latest);
      show({ text: "ほかのタブで変わったので戻せません" });
      return;
    }
    commit(restored);
    setDraft(null);
    show({ text: "元に戻しました" });
    focusLater(restored.current ? NEXT_BUTTON : TITLE_FIELD);
  };

  const submitStart = () =>
    apply((d) => startTask(d, { title: formTitle, firstStep: formStep }, newId(), Date.now()), "決めました", NEXT_BUTTON);

  const openNext = () => {
    if (!current) return;
    setDraft({ mode: "next", taskId: current.id, title: "", firstStep: "" });
    focusLater(STEP_FIELD);
  };

  const submitNext = () => {
    if (!current) return;
    apply((d) => nextStep(d, current.id, formStep), "次の一手にしました", NEXT_BUTTON);
  };

  const openEdit = () => {
    if (!current) return;
    setDraft({ mode: "edit", taskId: current.id, title: current.title, firstStep: current.firstStep });
    focusLater(TITLE_FIELD);
  };

  const submitEdit = () => {
    if (!current) return;
    apply((d) => editTask(d, current.id, { title: formTitle, firstStep: formStep }), "書き直しました", EDIT_BUTTON);
  };

  const cancel = () => {
    const back = mode === "next" ? NEXT_BUTTON : EDIT_BUTTON;
    setDraft(null);
    focusLater(back);
  };

  const complete = () => {
    if (!current) return;
    apply((d) => completeTask(d, current.id, Date.now()), "済みにしました", TITLE_FIELD, true);
  };

  const change = (field: "title" | "firstStep", value: string) => {
    if (mode === "view") return;
    setDraft({
      mode,
      taskId: current?.id ?? null,
      title: field === "title" ? value : formTitle,
      firstStep: field === "firstStep" ? value : formStep,
    });
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next, storage);
  };

  const address = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const copyAddress = () => {
    navigator.clipboard?.writeText(address).then(
      () => show({ text: "アドレスをコピーしました" }),
      () => show({ text: "コピーできませんでした。アドレスを選んでコピーしてください" }),
    );
  };

  // ほかのタブの変更と、タブへ戻ってきたときの最新化。入力中の欄はタブごとの書きかけなので消えない
  useEffect(() => {
    const refresh = () => {
      const latest = storage ? loadData(storage) : memory.current;
      memory.current = latest;
      setData((prev) => (sameData(prev, latest) ? prev : latest));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh();
      if (e.key === THEME_KEY || e.key === null) setTheme(loadTheme(storage));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ほかのタブで今やることが変わり、書きかけの前提が無くなったら捨てる
  useEffect(() => {
    if (!draft) return;
    const stale = draft.mode === "start" ? current !== null : draft.taskId !== current?.id;
    if (stale) {
      setDraftState(null);
      saveDraft(null);
    }
  }, [draft, current]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  }, [theme]);

  useEffect(() => {
    if (!toast || toastPaused) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, toastPaused]);

  // キー操作。入力欄の中では効かせない（Ctrl+Z も入力欄では文字の取り消しのまま）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === "z") {
        if (isTyping(e.target) || !toast?.undo) return;
        e.preventDefault();
        undo();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat || mode !== "view") return;
      const action = { n: openNext, d: complete, e: openEdit }[key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const endCelebration = useCallback(() => setCelebration(0), []);
  const today = countToday(data.done, Date.now());

  return (
    <div className="app">
      <header className="topbar">
        <Clock />
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "画面を明るくする" : "画面を暗くする"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      {!storage && (
        <p className="notice">このブラウザでは書いた内容を残せません。タブを閉じると消えます。</p>
      )}

      <main className="main">
        {mode === "view" && current ? (
          <section className="focus" aria-labelledby="focus-step">
            <p className="focus__eyebrow">今やること</p>
            <p className="focus__title">{current.title}</p>
            <h1 className="focus__label" id="focus-step">
              まずこれだけ
            </h1>
            <p key={current.firstStep} className="focus__step">
              {current.firstStep}
            </p>
            <div className="focus__actions">
              <button id={NEXT_BUTTON} type="button" className="button button--primary" onClick={openNext} aria-keyshortcuts="N">
                一手済んだ <kbd>N</kbd>
              </button>
              <button type="button" className="button button--done" onClick={complete} aria-keyshortcuts="D">
                全部済んだ <kbd>D</kbd>
              </button>
              <button id={EDIT_BUTTON} type="button" className="button button--ghost" onClick={openEdit} aria-keyshortcuts="E">
                書き直す <kbd>E</kbd>
              </button>
            </div>
          </section>
        ) : (
          <>
            {mode === "next" && current && (
              <div className="context">
                <p className="focus__eyebrow">今やること</p>
                <p className="context__title">{current.title}</p>
              </div>
            )}
            <TaskForm
              key={mode}
              mode={mode === "view" ? "start" : mode}
              title={formTitle}
              firstStep={formStep}
              onChange={change}
              onSubmit={mode === "next" ? submitNext : mode === "edit" ? submitEdit : submitStart}
              onCancel={mode === "start" ? undefined : cancel}
            />
          </>
        )}
      </main>

      <footer className="footer">
        <p className="footer__count">
          今日済んだこと <strong className="footer__number">{today}</strong> 件
        </p>
        <details className="help">
          <summary className="help__summary">新しいタブに出すには</summary>
          <div className="help__body">
            <ol className="help__steps">
              <li>Vivaldi の設定を開く</li>
              <li>「タブ」の設定にある新しいタブのページで「特定のページ」を選ぶ</li>
              <li>下のアドレスを貼り付ける</li>
            </ol>
            <div className="help__address">
              <code>{address}</code>
              <button type="button" className="button button--small" onClick={copyAddress}>
                コピー
              </button>
            </div>
            <ul className="help__notes">
              <li>書いた内容はこの端末のブラウザにだけ保存されます。別の端末には引き継がれません。</li>
              <li>キー操作は画面を一度クリックすると効きます。</li>
            </ul>
          </div>
        </details>
      </footer>

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div
            key={toast.id}
            className="toast"
            onMouseEnter={() => setToastPaused(true)}
            onMouseLeave={() => setToastPaused(false)}
            onFocus={() => setToastPaused(true)}
            onBlur={() => setToastPaused(false)}
          >
            <span className="toast__text">{toast.text}</span>
            {toast.undo && (
              <button type="button" className="toast__undo" onClick={undo} aria-keyshortcuts="Control+Z">
                元に戻す <kbd>Ctrl+Z</kbd>
              </button>
            )}
          </div>
        )}
      </div>

      {celebration > 0 && <Celebration key={celebration} onDone={endCelebration} />}
    </div>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </g>
    </svg>
  );
}
