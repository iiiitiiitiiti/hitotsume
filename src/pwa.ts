import { registerSW } from "virtual:pwa-register";
import { hasDraft } from "./store";

/*
 * 新しい版が届いても、見ている最中や書きかけのあるタブでは入れ替えない。
 * タブが裏に回り、書きかけも無いときにだけ入れ替えて再読み込みする。
 * 1つのタブが入れ替えると、ほかのタブにも onNeedReload が届くので、同じ条件で待たせる。
 */
const canApply = () => document.visibilityState === "hidden" && !hasDraft();

export function setupPwa(): void {
  let waiting = false;
  let reloadPending = false;

  const updateSW = registerSW({
    onNeedRefresh() {
      waiting = true;
      tryApply();
    },
    onNeedReload() {
      reloadPending = true;
      tryApply();
    },
  });

  function tryApply() {
    if (!canApply()) return;
    if (reloadPending) {
      reloadPending = false;
      window.location.reload();
    } else if (waiting) {
      waiting = false;
      void updateSW();
    }
  }

  document.addEventListener("visibilitychange", tryApply);
}
