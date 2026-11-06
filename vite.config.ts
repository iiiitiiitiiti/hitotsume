/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = "/hitotsume/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 新しいタブで何十枚も開くので、自動更新（全タブを一斉に再読み込み）にはしない。
      // 切り替えの時機は src/pwa.ts が決める
      registerType: "prompt",
      manifest: {
        id: base,
        name: "ひとつめ",
        short_name: "ひとつめ",
        description: "今やることと今日の予定・天気・読み物を1枚にまとめた新しいタブ",
        lang: "ja",
        display: "standalone",
        start_url: base,
        scope: base,
        theme_color: "#EEF0F2",
        background_color: "#EEF0F2",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        navigateFallback: "index.html",
        // 文字（IBM Plex Sans JP の分割ファイル）も最初に全部取り込み、オフラインでも欠けないようにする
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  build: {
    // 古いタブが消えたファイルを取りに行かないよう、1本にまとめる
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    environment: "jsdom",
    // Node 25 以降はメソッドの無い localStorage をグローバルに置き、jsdom の localStorage を隠す
    execArgv: ["--no-experimental-webstorage"],
  },
});
