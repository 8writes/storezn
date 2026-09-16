"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Star, ImagePlus, X, Loader2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { formatDate } from "@/lib/format.js";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";

function Stars({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={onChange ? () => onChange(n) : undefined}
          className={onChange ? "cursor-pointer" : ""}
          aria-label={`${n} star`}
        >
          <Star size={onChange ? 22 : 14} className={n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({ productId }) {
  const { token } = useCustomerAuth();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    fetch(`/api/v1/storefront/products/${productId}/reviews`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  };

  useEffect(load, [productId, token]);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image must be smaller than 3MB");
      return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const body = new FormData();
      body.append("file", new File([buffer], file.name, { type: file.type }));
      const res = await fetch("/api/v1/storefront/reviews/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setImageUrl(resData.url);
    } catch (err) {
      toast.error(err.message || "Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Pick a star rating");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/storefront/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment || undefined, imageUrl: imageUrl || undefined }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      toast.success("Review posted");
      setRating(0);
      setComment("");
      setImageUrl("");
      load();
    } catch (err) {
      toast.error(err.message || "Could not post review");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return null;

  return (
    <div className="mt-12 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900">Reviews</h2>
        {data.count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-slate-800">
            <Stars value={Math.round(data.average)} />
            {data.average.toFixed(1)} ({data.count})
          </span>
        )}
      </div>

      {data.eligibleOrderId && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            Write a review
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
              <BadgeCheck size={13} /> Verified buyer
            </span>
          </p>
          <Stars value={rating} onChange={setRating} />
          <Textarea placeholder="Optional comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} className="hidden" />
          {imageUrl ? (
            <div className="relative w-24 h-24">
              <img src={imageUrl} alt="Your review photo" className="w-24 h-24 object-cover rounded-sm border border-slate-200" />
              <button
                type="button"
                onClick={() => setImageUrl("")}
                aria-label="Remove photo"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-60 cursor-pointer"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {uploading ? "Uploading…" : "Add a photo"}
            </button>
          )}

          <Button type="submit" size="sm" loading={submitting} disabled={uploading}>Post review</Button>
        </form>
      )}

      {data.reviews.length === 0 ? (
        <p className="text-sm text-slate-700">No reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((r) => (
            <div key={r.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Stars value={r.rating} />
                <span className="text-sm font-medium text-slate-700">{r.firstName || "Customer"}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                  <BadgeCheck size={12} /> Verified buyer
                </span>
                <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment && <p className="text-sm text-slate-700 mt-1">{r.comment}</p>}
              {r.imageUrl && (
                <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                  <img
                    src={r.imageUrl}
                    alt="Review photo"
                    className="w-20 h-20 object-cover rounded-sm border border-slate-200 hover:opacity-90 transition-opacity"
                  />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
