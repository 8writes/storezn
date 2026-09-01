"use client";
import { useEffect, useRef, useState } from "react";
import { Video, X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

export function ProductGallery({ images = [], videoUrl, name }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const stripRef = useRef(null);

  // Video always sits last - the first slide shown is always a photo, a
  // vendor's cover image stays the cover even once they add a clip.
  const slides = [
    ...images.map((src) => ({ type: "image", src })),
    ...(videoUrl ? [{ type: "video", src: videoUrl }] : []),
  ];
  const count = slides.length;
  const current = slides[active];

  // The main viewer is a native scroll-snap strip: swiping moves between
  // slides on touch, and on desktop the thumbnails scroll it here instead.
  const onStripScroll = (el) => {
    if (!el || !el.clientWidth) return;
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    setActive((prev) => (prev === i ? prev : i));
  };

  const goTo = (i) => {
    const next = Math.max(0, Math.min(count - 1, i));
    setActive(next);
    stripRef.current?.scrollTo({ left: next * stripRef.current.clientWidth, behavior: "smooth" });
  };

  if (count === 0) {
    return <div className="aspect-4/5 bg-slate-100 flex items-center justify-center text-slate-300 text-sm">No image</div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={stripRef}
          onScroll={(e) => onStripScroll(e.currentTarget)}
          className="flex aspect-4/5 bg-slate-100 overflow-x-auto snap-x snap-mandatory scrollbar-none"
        >
          {slides.map((slide, i) => (
            <div key={slide.src} className="w-full h-full shrink-0 snap-center">
              {slide.type === "video" ? (
                <video src={slide.src} controls playsInline className="w-full h-full object-contain bg-black" />
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="View photo larger"
                  className="block w-full h-full cursor-zoom-in"
                >
                  <img src={slide.src} alt={name} draggable={false} className="w-full h-full object-cover" />
                </button>
              )}
            </div>
          ))}
        </div>

        {count > 1 && (
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {active + 1} / {count}
          </span>
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
                  <video src={slide.src} className="w-full h-full object-cover" muted />
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

// Full-screen viewer: swipe (or arrow) between slides, tap a photo to
// toggle 2.5x zoom, then drag to pan around it.
function Lightbox({ slides, index, name, onIndexChange, onClose }) {
  const count = slides.length;
  const current = slides[index];
  const [zoom, setZoom] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const touchRef = useRef(null);

  // Moving to another slide always drops zoom/pan - done here rather than
  // in an effect on `index` so there's no extra render pass.
  const changeIndex = (i) => {
    if (i < 0 || i >= count || i === index) return;
    setZoom(false);
    setPan({ x: 0, y: 0 });
    onIndexChange(i);
  };
  const step = (dir) => {
    if (!zoom) changeIndex(index + dir);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, zoom]);

  const toggleZoom = () => {
    if (current.type !== "image") return;
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

  const onTouchStart = (e) => {
    if (zoom || e.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
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

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget && !zoom) onClose();
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current.type === "video" ? (
          <video src={current.src} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <img
            src={current.src}
            alt={name}
            draggable={false}
            onClick={toggleZoom}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom ? 2.5 : 1})`,
              transition: dragging ? "none" : "transform 0.2s ease",
              touchAction: "none",
              cursor: zoom ? "grab" : "zoom-in",
            }}
            className="max-h-full max-w-full object-contain"
          />
        )}

        {count > 1 && !zoom && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer sm:flex"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
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
              onClick={() => changeIndex(i)}
              className={`relative h-12 w-12 shrink-0 overflow-hidden border-2 cursor-pointer ${
                i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {slide.type === "video" ? (
                <>
                  <video src={slide.src} muted className="h-full w-full object-cover" />
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
