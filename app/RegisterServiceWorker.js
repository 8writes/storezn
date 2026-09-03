"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reg;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
      })
      .catch(() => {});

    // A register/till tab can stay open for a whole shift - re-check for
    // a new service worker version hourly and when the tab is refocused,
    // so cache-strategy fixes actually reach it.
    const update = () => reg?.update().catch(() => {});
    const iv = setInterval(update, 60 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
