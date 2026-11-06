import "@fontsource/ibm-plex-sans-jp/400.css";
import "@fontsource/ibm-plex-sans-jp/700.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { setupPwa } from "./pwa";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つかりません");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

setupPwa();
