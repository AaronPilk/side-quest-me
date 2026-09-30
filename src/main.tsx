import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { isNativeApp } from "./lib/runtime";
import { cleanupNativeShareCache } from "./lib/native-share";
import "./styles.css";
import "./design.css";
import "./native-design.css";
import "./glass-design.css";
if (isNativeApp()) {
  document.documentElement.classList.add("native-app");
  void cleanupNativeShareCache().catch(() => {});
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
if (!isNativeApp() && "serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
