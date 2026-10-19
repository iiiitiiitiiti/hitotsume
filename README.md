# ひとつめ

「今やること」1つと「最初の一手」だけを、ブラウザの新しいタブへ大きく出すページです。新しいタブを開くと毎回目に入るので、ほかのサイトより先に手を付けられます。

- 公開 URL: https://iiiitiiitiiti.github.io/hitotsume/
- 書いた内容はその端末のブラウザの中（localStorage）だけに保存されます。別の端末には引き継がれません
- 一度開けば、次からはオフラインでも表示されます

## 新しいタブに出す（Vivaldi）

1. 設定 → タブ →「新しいタブページ」を「特定のページ」にする
2. 欄に公開 URL を貼る

新しいタブではアドレスバーにカーソルが乗ります。画面を一度クリックすると、下のキー操作が使えます。

## 使い方

| 操作 | ボタン | キー |
|---|---|---|
| 一手が済んで次の一手に差し替える | 一手済んだ | N |
| 今やることを済みにする | 全部済んだ | D |
| 今やること・一手を書き直す | 書き直す | E |
| 直前の操作を元に戻す | 元に戻す（8秒表示） | Ctrl+Z |
| 入力をやめる | やめる | Esc |

1文字のキーは入力欄の外でだけ使えます。入力欄の Enter は1欄目なら次の欄へ、2欄目なら決定です。

## 開発（Mac / Windows 共通）

Node.js 22 以上が必要です。

```sh
git clone https://github.com/iiiitiiitiiti/hitotsume.git
cd hitotsume
npm ci
npm run dev          # http://localhost:5173/hitotsume/
```

| コマンド | 内容 |
|---|---|
| `npm run lint` | 型チェック |
| `npm test` | 保存・状態変化のテスト（vitest） |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果を http://localhost:4173/hitotsume/ で開く |

`main` へ push すると GitHub Actions が型チェック・テスト・ビルドを通してから GitHub Pages へ公開します。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/store.ts` | 保存・読み込み・検証、読めないデータの退避、テーマと書きかけの保存 |
| `src/model.ts` | 状態の変化（決める・一手済んだ・書き直す・済んだ・元に戻す）の純関数 |
| `src/App.tsx` | 画面全体・ほかのタブとの同期・キー操作・トースト |
| `src/TaskForm.tsx` | 入力フォーム（決める／次の一手／書き直す） |
| `src/Celebration.tsx` | 「全部済んだ」の演出 |
| `src/pwa.ts` | 新しい版への切り替え（タブが裏にあり書きかけが無いときだけ） |
| `public/theme.js` | React 起動前にテーマを当て、暗い画面のちらつきを防ぐ |

設計の全体は [docs/DESIGN.md](docs/DESIGN.md)、判断の記録は [docs/decisions/](docs/decisions/) にあります。
