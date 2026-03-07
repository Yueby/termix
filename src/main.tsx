import { attachConsole } from "@tauri-apps/plugin-log";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

attachConsole();

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
