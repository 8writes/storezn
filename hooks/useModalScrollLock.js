"use client";

import { useEffect } from "react";

let lockCount = 0;
let previousStyles = null;

export function useModalScrollLock(open) {
  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    if (lockCount === 0) {
      previousStyles = {
        htmlOverflow: html.style.overflow,
        htmlOverscroll: html.style.overscrollBehavior,
        bodyOverflow: body.style.overflow,
        bodyOverscroll: body.style.overscrollBehavior,
      };
      html.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      body.dataset.modalOpen = "true";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0) return;
      html.style.overflow = previousStyles?.htmlOverflow || "";
      html.style.overscrollBehavior = previousStyles?.htmlOverscroll || "";
      body.style.overflow = previousStyles?.bodyOverflow || "";
      body.style.overscrollBehavior = previousStyles?.bodyOverscroll || "";
      delete body.dataset.modalOpen;
      previousStyles = null;
    };
  }, [open]);
}
