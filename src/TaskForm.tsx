import { useState, type FormEvent, type KeyboardEvent } from "react";
import { cleanText, MAX_TEXT } from "./store";
import type { Draft } from "./types";

type Props = {
  mode: Draft["mode"];
  title: string;
  firstStep: string;
  onChange: (field: "title" | "firstStep", value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
};

const COPY = {
  start: { heading: "今やることを1つ決める", submit: "決めた" },
  next: { heading: "次の一手は？", submit: "これにする" },
  edit: { heading: "書き直す", submit: "保存" },
} as const;

export const TITLE_FIELD = "field-title";
export const STEP_FIELD = "field-step";

/** 日本語入力の変換を確定する Enter かどうか */
const isComposing = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

export function TaskForm({ mode, title, firstStep, onChange, onSubmit, onCancel }: Props) {
  const [errors, setErrors] = useState<{ title?: boolean; firstStep?: boolean }>({});
  const showTitle = mode !== "next";
  const copy = COPY[mode];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { title: showTitle && !cleanText(title), firstStep: !cleanText(firstStep) };
    setErrors(next);
    if (next.title) return document.getElementById(TITLE_FIELD)?.focus();
    if (next.firstStep) return document.getElementById(STEP_FIELD)?.focus();
    onSubmit();
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || isComposing(e)) return;
    e.preventDefault();
    document.getElementById(STEP_FIELD)?.focus();
  };

  const onStepKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isComposing(e)) e.preventDefault();
  };

  const onFormKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape" && onCancel && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <form className={`task-form task-form--${mode}`} onSubmit={submit} onKeyDown={onFormKey} noValidate>
      <h3 className="task-form__heading">{copy.heading}</h3>

      {showTitle && (
        <div className="field">
          <label className="field__label" htmlFor={TITLE_FIELD}>
            今やること
          </label>
          <input
            id={TITLE_FIELD}
            className="field__input"
            type="text"
            value={title}
            maxLength={MAX_TEXT}
            placeholder="例: 引っ越しの見積もりを頼む"
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={errors.title || undefined}
            aria-describedby={errors.title ? `${TITLE_FIELD}-error` : undefined}
            onChange={(e) => {
              onChange("title", e.target.value);
              if (errors.title) setErrors((v) => ({ ...v, title: false }));
            }}
            onKeyDown={onTitleKey}
          />
          {errors.title && (
            <p id={`${TITLE_FIELD}-error`} className="field__error">
              今やることを書いてください
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor={STEP_FIELD}>
          {mode === "next" ? "次の一手" : "最初の一手"}
          <span className="field__hint">（2分でできること）</span>
        </label>
        <input
          id={STEP_FIELD}
          className="field__input"
          type="text"
          value={firstStep}
          maxLength={MAX_TEXT}
          placeholder="例: 見積もりサイトを開く"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={errors.firstStep || undefined}
          aria-describedby={errors.firstStep ? `${STEP_FIELD}-error` : undefined}
          onChange={(e) => {
            onChange("firstStep", e.target.value);
            if (errors.firstStep) setErrors((v) => ({ ...v, firstStep: false }));
          }}
          onKeyDown={onStepKey}
        />
        {errors.firstStep && (
          <p id={`${STEP_FIELD}-error`} className="field__error">
            一手を書いてください
          </p>
        )}
      </div>

      <div className="task-form__actions">
        <button type="submit" className="pill pill--go">
          {copy.submit}
        </button>
        {onCancel && (
          <button type="button" className="pill" onClick={onCancel} aria-keyshortcuts="Escape">
            やめる <kbd>Esc</kbd>
          </button>
        )}
      </div>
    </form>
  );
}
