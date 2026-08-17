"use client";
import { useState } from "react";
import { Video } from "lucide-react";

export function ProductGallery({ images = [], videoUrl, name }) {
  const [active, setActive] = useState(0);
  // Video always sits last - the first slide shown is always a photo, a
  // vendor's cover image stays the cover even once they add a clip.
  const slides = [
    ...images.map((src) => ({ type: "image", src })),
    ...(videoUrl ? [{ type: "video", src: videoUrl }] : []),
  ];
  const hasSlides = slides.length > 0;
  const current = slides[active];

  return (
    <div className="space-y-3">
      <div className="aspect-4/5 bg-slate-100 overflow-hidden">
        {hasSlides ? (
          current.type === "video" ? (
            <video src={current.src} controls className="w-full h-full object-contain bg-black" />
          ) : (
            <img src={current.src} alt={name} className="w-full h-full object-cover" />
          )
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300 text-sm">No image</span>
        )}
      </div>
      {slides.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => setActive(i)}
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
    </div>
  );
}
