"use client";
import { useEffect, useRef, useState } from "react";

// Scroll-into-view reveal for the marketing pages: content is fully
// rendered server-side (SEO/no-JS safe - a 1s fallback forces it visible
// even if the observer never fires), it just animates up + in the first
// time it enters the viewport. Honours prefers-reduced-motion via the
// motion-reduce: utilities below.
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = () => setShown(true);
    if (typeof IntersectionObserver === "undefined") {
      done();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          done();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(el);
    const fallback = setTimeout(done, 1000);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
