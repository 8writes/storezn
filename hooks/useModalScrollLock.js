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
        bodyOverflow: body.style.overflow,
        bodyOverscroll: body.style.overscrollBehavior,
        bodyPaddingRight: body.style.paddingRight,
      };
      // Hiding the desktop scrollbar changes the viewport width and makes
      // the dashboard's sticky sidebar/content flex layout visibly jump.
      // Reserve that exact gutter before locking so everything stays put.
      const scrollbarWidth = window.innerWidth - html.clientWidth;
      if (scrollbarWidth > 0) {
        const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
      // Do not lock <html>: the dashboard intentionally keeps its
      // overflow-x as `clip` so the desktop sidebar can remain sticky.
      // Changing it to `hidden` creates a new scroll context and pulls
      // that sidebar out of its expected viewport position.
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      body.dataset.modalOpen = "true";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0) return;
      body.style.overflow = previousStyles?.bodyOverflow || "";
      body.style.overscrollBehavior = previousStyles?.bodyOverscroll || "";
      body.style.paddingRight = previousStyles?.bodyPaddingRight || "";
      delete body.dataset.modalOpen;
      previousStyles = null;
    };
  }, [open]);
}
