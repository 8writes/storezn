"use client";
import { useEffect, useRef, useState } from "react";
import { Video, X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

export function ProductGallery({ images = [], videoUrl, name }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Video always sits last - the first slide shown is always a photo, a
  // vendor's cover image stays the cover even once they add a clip.
  const slides = [
    ...images.map((src) => ({ type: "image", src })),
    ...(videoUrl ? [{ type: "video", src: videoUrl }] : []),
  ];
  const count = slides.length;
  const current = slides[active];

  // Tap/click only, no swipe - a horizontal-swipe carousel here kept
  // fighting with the page's own vertical scroll on touch devices no
  // matter how it was tuned, so it's gone. Previous/next arrows plus the
  // thumbnail strip below cover the same job without that risk.
  const goTo = (i) => setActive(Math.max(0, Math.min(count - 1, i)));

  if (count === 0) {
    return <div className="aspect-4/5 bg-slate-100 flex items-center justify-center text-slate-300 text-sm">No image</div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-4/5 bg-slate-100 overflow-hidden">
        {current.type === "video" ? (
          <video src={current.src} controls playsInline preload="metadata" className="w-full h-full object-contain bg-black" />
        ) : (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="View photo larger"
            className="block w-full h-full cursor-zoom-in"
          >
            <img src={current.src} alt={name} draggable={false} className="w-full h-full object-cover" />
          </button>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md hover:bg-white disabled:opacity-0 disabled:pointer-events-none transition-opacity cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              disabled={active === count - 1}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md hover:bg-white disabled:opacity-0 disabled:pointer-events-none transition-opacity cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
            <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {active + 1} / {count}
            </span>
          </>
        )}
        {current?.type === "image" && (
          <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white sm:hidden">
            <ZoomIn size={12} />
            Tap to zoom
          </span>
        )}
      </div>

      {count > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => goTo(i)}
              className={`relative aspect-square bg-slate-100 overflow-hidden border transition-colors cursor-pointer ${
                i === active ? "border-slate-900" : "border-transparent hover:border-slate-300"
              }`}
            >
              {slide.type === "video" ? (
                <>
                  <video src={slide.src} className="w-full h-full object-cover" muted preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Video size={16} className="text-white" />
                  </span>
                </>
              ) : (
                <img src={slide.src} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <Lightbox slides={slides} index={active} name={name} onIndexChange={goTo} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}

// Full-screen viewer. Every slide is a permanently-mounted cell in a
// native scroll-snap strip, so moving between them is just the browser
// scrolling - no src swap, no transition replay, no flicker. Zoom/pan
// only ever touches the slide that's currently centred.
function Lightbox({ slides, index, name, onIndexChange, onClose }) {
  useModalScrollLock(true);
  const count = slides.length;
  const stripRef = useRef(null);
  const [zoom, setZoom] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const resetView = () => {
    setZoom(false);
    setPan({ x: 0, y: 0 });
  };

  const goTo = (i) => {
    const next = Math.max(0, Math.min(count - 1, i));
    if (next === index) return;
    resetView();
    // Jump, don't animate: a smooth scroll across several slides fires
    // intermediate scroll events that the handler below would read as
    // stops on the slides in between.
    const el = stripRef.current;
    if (el) el.scrollLeft = next * el.clientWidth;
    onIndexChange(next);
  };

  // Jump straight to the opening slide once, with no animation, so the
  // scroll handler never sees an intermediate position.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goTo(index + 1);
      else if (e.key === "ArrowLeft") goTo(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, zoom]);

  // Swiping the strip settles on a new slide - sync `index` to it.
  const onStripScroll = (el) => {
    if (zoom || !el.clientWidth) return;
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (i !== index) {
      resetView();
      onIndexChange(i);
    }
  };

  const toggleZoom = () => {
    setZoom((z) => !z);
    setPan({ x: 0, y: 0 });
  };
  const onPointerDown = (e) => {
    if (!zoom) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!zoom || !dragRef.current) return;
    setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm tabular-nums text-white/80">{count > 1 ? `${index + 1} / ${count}` : ""}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={stripRef}
          onScroll={(e) => onStripScroll(e.currentTarget)}
          className="flex h-full w-full snap-x snap-mandatory scrollbar-none"
          style={{ overflowX: zoom ? "hidden" : "auto", scrollSnapType: zoom ? "none" : undefined }}
        >
          {slides.map((slide, i) => {
            const activeSlide = i === index;
            return (
              <div
                key={slide.src}
                className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !zoom) onClose();
                }}
              >
                {slide.type === "video" ? (
                  <video src={slide.src} controls playsInline preload="metadata" className="max-h-full max-w-full" />
                ) : (
                  <img
                    src={slide.src}
                    alt={name}
                    draggable={false}
                    onClick={activeSlide ? toggleZoom : undefined}
                    onPointerDown={activeSlide ? onPointerDown : undefined}
                    onPointerMove={activeSlide ? onPointerMove : undefined}
                    onPointerUp={activeSlide ? onPointerUp : undefined}
                    onPointerCancel={activeSlide ? onPointerUp : undefined}
                    style={
                      activeSlide
                        ? {
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom ? 2.5 : 1})`,
                            transition: dragging ? "none" : "transform 0.2s ease",
                            touchAction: "none",
                            cursor: zoom ? "grab" : "zoom-in",
                          }
                        : undefined
                    }
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </div>
            );
          })}
        </div>

        {count > 1 && !zoom && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer sm:flex"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index === count - 1}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer sm:flex"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto p-3 scrollbar-none">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => goTo(i)}
              className={`relative h-12 w-12 shrink-0 overflow-hidden border-2 cursor-pointer ${
                i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {slide.type === "video" ? (
                <>
                  <video src={slide.src} muted preload="metadata" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Video size={12} className="text-white" />
                  </span>
                </>
              ) : (
                <img src={slide.src} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
