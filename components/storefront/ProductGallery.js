"use client";
import { useState } from "react";

export function ProductGallery({ images = [], name }) {
  const [active, setActive] = useState(0);
  const hasImages = images.length > 0;

  return (
    <div className="space-y-3">
      <div className="aspect-square bg-slate-100 overflow-hidden">
        {hasImages ? (
          <img src={images[active]} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300 text-sm">No image</span>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={`aspect-square bg-slate-100 overflow-hidden border transition-colors cursor-pointer ${
                i === active ? "border-slate-900" : "border-transparent hover:border-slate-300"
              }`}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
