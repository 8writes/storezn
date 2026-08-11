"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Scrolls the window back to the top on every route change. Subscribing to
// the pathname and syncing an external system (scroll position) is exactly
// what an effect is for - no setState involved, nothing for
// react-hooks/set-state-in-effect to flag.
export default function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
