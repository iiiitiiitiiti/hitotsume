import { useCallback } from "react";

/**
 * 広い画面では欄の高さが決まっていて、入りきらない行は CSS で右の見えない列へ回る（styles.css の「1画面に収める」）。
 * 回った行は見えないので、キーボードで移ってもどこにいるか分からなくなる。そこで inert にして届かないようにする。
 * 行が入れ替わったときと、欄の大きさが変わったときに測り直す。
 */
export function useFitList<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const mark = () => {
      const left = el.getBoundingClientRect().left;
      for (const item of el.children) {
        if (item instanceof HTMLElement) item.inert = item.getBoundingClientRect().left - left >= el.clientWidth;
      }
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    const mo = new MutationObserver(mark);
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
}

/**
 * 包む枠に入る行数を数え、中の本文を切る行数（--lines）にする。狭い画面では CSS の行数（6行）のまま。
 * 本文そのものではなく枠を測るのは、本文の高さを欄から決めると Chrome が行数の指定を効かせなかったため。
 */
export function useFitLines<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const fit = () => {
      el.style.removeProperty("--lines");
      const text = el.firstElementChild;
      // 高さが欄から決まるのは広い画面だけ（CSS で contain: size を付けたとき）
      if (!(text instanceof HTMLElement) || !getComputedStyle(el).contain.includes("size")) return;
      const css = getComputedStyle(text);
      const line = parseFloat(css.lineHeight);
      const room = el.clientHeight - parseFloat(css.marginTop);
      if (line > 0) el.style.setProperty("--lines", String(Math.max(1, Math.floor(room / line))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}
