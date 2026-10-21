"use client";
import { X, ImagePlus, Loader2, GripVertical, Video } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { PRODUCT_VIDEO_MAX_SECONDS, formatUploadSize } from "@/lib/clientUpload.js";
import { PRODUCT_VIDEO_MAX_BYTES } from "@/lib/mediaValidation.js";

// Photos (drag to reorder, first is the cover) and the optional video for
// the add and edit product pages. Presentational: each page owns the
// upload/remove/reorder handlers, since the edit page saves photo changes
// straight away and the add page keeps them until "Create product".
export const MAX_PRODUCT_MEDIA = 10;

export function ProductMediaField({
  images,
  pendingUploads,
  dragIndex,
  onDragStart,
  onDrop,
  onDragEnd,
  onImageUpload,
  onRemoveImage,
  showPhotos = true,
  showVideo = true,
  videoUrl,
  uploadingVideo,
  videoUploadStatus,
  videoUploadProgress,
  onVideoUpload,
  onRemoveVideo,
}) {
  const used = images.length + pendingUploads.length + (videoUrl || uploadingVideo ? 1 : 0);
  return (
    <div className="space-y-5">
      {showPhotos && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">The first photo is the cover in your store. Drag to reorder. Up to {MAX_PRODUCT_MEDIA} photos and video in total.</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {images.map((url, index) => (
              <div
                key={url}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                onDragEnd={onDragEnd}
                className={`group relative aspect-square rounded-sm border border-slate-200 overflow-hidden cursor-grab active:cursor-grabbing ${dragIndex === index ? "opacity-40" : ""}`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                {index === 0 && <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-neutral-900/80 text-white text-[10px] font-medium">Cover</span>}
                {/* Grip is a desktop drag hint; the remove button stays
                    visible - hover never fires on touch screens. */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
                  <GripVertical size={16} className="absolute top-1 left-1 text-white drop-shadow opacity-0 group-hover:opacity-100" />
                </div>
                <button type="button" onClick={() => onRemoveImage(url)} aria-label="Remove photo" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer">
                  <X size={13} />
                </button>
              </div>
            ))}

            {pendingUploads.map((entry) => (
              <div key={entry.key} className="relative aspect-square rounded-sm border border-slate-200 overflow-hidden">
                <img src={entry.localUrl} alt="" className="w-full h-full object-cover opacity-50" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 px-1 text-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                  <span className="text-[10px] font-medium leading-tight text-white">
                    {entry.status || "Uploading..."}
                    {entry.progress != null ? ` ${entry.progress}%` : ""}
                  </span>
                </div>
              </div>
            ))}

            {used < MAX_PRODUCT_MEDIA && (
              <label className="aspect-square rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                <ImagePlus size={22} />
                <span className="text-xs font-medium">Add photos</span>
                <input type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
              </label>
            )}
          </div>
        </div>
      )}

      {showVideo && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-slate-700">Video <span className="font-normal text-slate-500">(optional)</span></p>
            <InfoTip>A short clip of the product - up to {PRODUCT_VIDEO_MAX_SECONDS}s and {formatUploadSize(PRODUCT_VIDEO_MAX_BYTES)}.</InfoTip>
          </div>
          {videoUrl ? (
            <div className="relative w-44">
              <video src={videoUrl} controls preload="metadata" className="w-44 rounded-sm border border-slate-200" />
              <button type="button" onClick={onRemoveVideo} aria-label="Remove video" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer">
                <X size={13} />
              </button>
            </div>
          ) : uploadingVideo ? (
            <div className="w-44 h-24 rounded-sm border border-slate-200 flex flex-col items-center justify-center gap-1 bg-slate-50 px-2 text-center">
              <Loader2 size={20} className="text-slate-400 animate-spin" />
              <span className="text-[11px] font-medium text-slate-700">
                {videoUploadStatus || "Uploading video..."}
                {videoUploadProgress != null ? ` ${videoUploadProgress}%` : ""}
              </span>
            </div>
          ) : images.length + pendingUploads.length < MAX_PRODUCT_MEDIA ? (
            <label className="w-44 h-20 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
              <Video size={20} />
              <span className="text-xs font-medium">Add video</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={onVideoUpload} className="hidden" />
            </label>
          ) : (
            <p className="text-xs text-slate-600">Remove a photo to make room for a video.</p>
          )}
        </div>
      )}
    </div>
  );
}
