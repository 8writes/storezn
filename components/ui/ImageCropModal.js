"use client";
import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { getCroppedImageBlob } from "@/lib/cropImage.js";

// Lets the vendor reposition/zoom their upload within a fixed shape
// before it's saved, so the result is always exactly the part of the
// image they chose - not whatever a blind object-fit crop lands on.
// Shared by the rectangular navbar logo and the round favicon uploads,
// which pass different aspect/cropShape/output dimensions.
//
// The crop/zoom/pixel state lives in CropperPanel, keyed by imageSrc in
// the parent below - remounting on a new file gives fresh initial state
// for free, instead of an effect that resets it on every open.
export function ImageCropModal({
  open,
  imageSrc,
  title = "Crop image",
  aspect = 1,
  cropShape = "rect",
  outputWidth = 512,
  outputHeight = 512,
  onCancel,
  onCropped,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <button type="button" onClick={onCancel} className="cursor-pointer text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <CropperPanel
          key={imageSrc}
          imageSrc={imageSrc}
          aspect={aspect}
          cropShape={cropShape}
          outputWidth={outputWidth}
          outputHeight={outputHeight}
          onCancel={onCancel}
          onCropped={onCropped}
        />
      </div>
    </div>
  );
}

function CropperPanel({ imageSrc, aspect, cropShape, outputWidth, outputHeight, onCancel, onCropped }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedPixels, { outputWidth, outputHeight });
      onCropped(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="relative w-full h-72 bg-slate-900">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={cropShape}
          showGrid={cropShape === "rect"}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="p-4 space-y-4">
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-brand-600"
          aria-label="Zoom"
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} loading={saving}>
            <Check size={16} />
            Use this crop
          </Button>
        </div>
      </div>
    </>
  );
}
