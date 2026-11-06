# ひとつめ

ブラウザの新しいタブに出す、1枚のダッシュボードです。今日の予定を時間の軸で見せ、その下に「今やること」・Claude の使用量・天気、さらに Tech News・作問の種・Wikipedia・note の記事を並べます。

- 公開 URL: https://iiiitiiitiiti.github.io/hitotsume/
- 予定・Tech News・作問の種・note・使用量は、PC で動く「係」（`helper/`）から届きます。係が止まっていても、今やること・天気・Wikipedia・リンクは出ます
- 今やること・リンク・天気の場所・note のタグは、その端末のブラウザの中（localStorage）だけに保存されます

## 新しいタブに出す（Vivaldi）

1. 設定 → タブ →「新しいタブページ」を「特定のページ」にする
2. 欄に公開 URL を貼る
3. 初めて開いたとき、ローカル ネットワーク（この PC の中）へつなぐ許可を聞かれたら許可する

新しいタブではアドレスバーにカーソルが乗ります。画面を一度クリックすると、下のキー操作が使えます。

## 係を動かす（Windows）

係は Node.js 24 以上で動く小さなサーバーです。`127.0.0.1:47615` だけで待ち受け、ひとつめの画面からの問い合わせにだけ答えます。

```powershell
# サインイン時に自動で動くよう登録する（スタートアップにショートカットを置く）
powershell -ExecutionPolicy Bypass -File helper\install-startup.ps1

# 今すぐ動かす。コードを直したあとは -Restart で入れ替える
powershell -ExecutionPolicy Bypass -File helper\start.ps1 -Restart

# 登録を外す
powershell -ExecutionPolicy Bypass -File helper\install-startup.ps1 -Remove
```

| 欄 | 係が読むもの |
|---|---|
| 予定 | 起動中の Outlook（クラシック版）の予定表。画面で選んだ日の分を読む。Outlook が閉じていれば読まない |
| Tech News | `G:\マイドライブ\Bookmarklet plug-in\local\docs\technews\` の日別 Markdown の「今朝のハイライト」 |
| 作問の種 | `G:\マイドライブ\クイズ\Claude資料\作問の種\` の日別 Markdown |
| note | タグの人気記事（note の非公式の窓口）。取れなければ `https://note.com/hashtag/{タグ}/rss` の新着 |
| よく見るサイトのアイコン | そのページが指定するアイコン。ログインが要るページは Google が控えているアイコン |
| Claude の使用量 | `~/.claude/.credentials.json` のログインで Anthropic の使用量を問い合わせる（非公式の窓口。読むだけで、ログインの更新はしない） |

フォルダは環境変数 `HITOTSUME_TECHNEWS_DIR`・`HITOTSUME_SEEDS_DIR` で差し替えられます。

## 使い方

| 操作 | ボタン | キー |
|---|---|---|
| 一手が済んで次の一手に差し替える | 一手済んだ | N |
| 今やることを済みにする | 全部済んだ | D |
| 今やること・一手を書き直す | 書き直す | E |
| 直前の操作を元に戻す | 元に戻す（8秒表示） | Ctrl+Z |
| 入力をやめる | やめる | Esc |

1文字のキーは入力欄の外でだけ使えます。よく見るサイトは右上の「＋」から足す・消す、天気の場所は天気の欄の地名、note のタグは「タグを変える」から変えます。予定の日は軸の上の ‹ › で切り替えます。右上の ？ で使い方を開きます。

## 開発（Mac / Windows 共通）

Node.js 22 以上が必要です（係を動かすなら 24 以上）。

```sh
git clone https://github.com/iiiitiiitiiti/hitotsume.git
cd hitotsume
npm ci
npm run dev          # http://localhost:5173/hitotsume/
```

| コマンド | 内容 |
|---|---|
| `npm run lint` | 型チェック（画面と係） |
| `npm test` | 保存・状態変化・軸の計算・係の読み取りのテスト（vitest） |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果を http://localhost:4173/hitotsume/ で開く |
| `HITOTSUME_DEV=1 node helper/server.ts` | 係を手前で動かす。開発ページ（localhost:5173・4173）からの問い合わせも受ける。止めるときは Ctrl+C |

`main` へ push すると GitHub Actions が型チェック・テスト・ビルドを通してから GitHub Pages へ公開します。係は公開されません。PC 側で `start.ps1 -Restart` を実行して入れ替えます。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | 画面全体・今やることの操作・ほかのタブとの同期・キー操作・トースト |
| `src/store.ts` / `src/model.ts` | 今やることの保存と状態の変化（純関数） |
| `src/TaskForm.tsx` | 今やることの入力（決める／次の一手／書き直す） |
| `src/dashboard/DayAxis.tsx` / `layout.ts` | 予定の軸。位置・段分け・次の予定までの時間の計算は `layout.ts` |
| `src/dashboard/Boxes.tsx` | Claude の使用量と天気 |
| `src/dashboard/Reads.tsx` | Tech News・作問の種・Wikipedia・note |
| `src/dashboard/Links.tsx` / `settings.ts` | よく見るサイトと、この端末に残す設定 |
| `src/dashboard/useRemote.ts` | 取得と再取得（タブが裏の間は止める）、係につながらないときの知らせ |
| `helper/server.ts` / `parse.ts` | 係の本体と、読み取ったものを画面へ渡す形に直す純関数 |
| `helper/outlook-today.ps1` | Outlook から今日の予定を読む（BOM 付き UTF-8 で保存する） |
| `src/pwa.ts` | 新しい版への切り替え（タブが裏にあり書きかけが無いときだけ） |

設計の全体は [docs/DESIGN.md](docs/DESIGN.md)、判断の記録は [docs/decisions/](docs/decisions/) にあります。
