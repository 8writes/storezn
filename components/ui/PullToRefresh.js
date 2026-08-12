"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

const THRESHOLD = 70;
const MAX_PULL = 100;

// Native-feeling pull-to-refresh, like any normal app - installed PWAs
// have no browser chrome at all, so there's no built-in pull-to-refresh
// (or reload button) some users expect otherwise. Reloads the whole page
// rather than just refetching data, same as a real app's pull-to-refresh
// usually does, simplest way to guarantee everything on screen is current.
export function PullToRefresh({ children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(null);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      setDragging(true);
    };
    const onTouchMove = (e) => {
      if (startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve, same idea as native pull-to-refresh - dragging
      // further makes each extra pixel of finger movement count for less.
      setPull(Math.min(MAX_PULL, delta * 0.5));
    };
    const onTouchEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      setDragging(false);
      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          window.location.reload();
          return MAX_PULL;
        }
        return 0;
      });
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing]);

  const height = refreshing ? 48 : pull;

  return (
    <div>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height, transition: dragging ? "none" : "height 0.2s ease-out" }}
      >
        <RotateCw
          size={20}
          className={`text-brand-600 ${refreshing || pull >= THRESHOLD ? "animate-spin" : ""}`}
          style={refreshing || pull >= THRESHOLD ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
