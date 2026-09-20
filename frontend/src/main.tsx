import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
} else if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) =>
    Promise.all([
      ...regs.map((reg) => reg.unregister()),
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    ]),
  );
}
