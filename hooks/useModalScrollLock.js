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
      // Lock <html>, never <body>: the root element's overflow propagates
      // to the viewport, so the page stops scrolling while <html> itself
      // stays a non-scroll container and position:sticky descendants keep
      // resolving against the viewport. Setting overflow on <body> instead
      // makes it a scroll container (it also drops its overflow-x: clip),
      // which yanks the dashboard's sticky sidebar back to the document
      // top for as long as the modal is open - see app/layout.js.
      html.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      body.dataset.modalOpen = "true";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0) return;
      html.style.overflow = previousStyles?.htmlOverflow || "";
      html.style.overscrollBehavior = previousStyles?.htmlOverscroll || "";
      body.style.paddingRight = previousStyles?.bodyPaddingRight || "";
      delete body.dataset.modalOpen;
      previousStyles = null;
    };
  }, [open]);
}
