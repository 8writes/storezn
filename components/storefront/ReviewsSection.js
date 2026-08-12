"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch(`/api/v1/storefront/products/${productId}/reviews`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  };

  useEffect(load, [productId, token]);

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
        body: JSON.stringify({ rating, comment: comment || undefined }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      toast.success("Review posted");
      setRating(0);
      setComment("");
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
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Stars value={Math.round(data.average)} />
            {data.average.toFixed(1)} ({data.count})
          </span>
        )}
      </div>

      {data.eligibleOrderId && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Write a review</p>
          <Stars value={rating} onChange={setRating} />
          <Textarea placeholder="Optional comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button type="submit" size="sm" loading={submitting}>Post review</Button>
        </form>
      )}

      {data.reviews.length === 0 ? (
        <p className="text-sm text-slate-700">No reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((r) => (
            <div key={r.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-medium text-slate-700">{r.firstName || "Customer"}</span>
                <span className="text-xs text-slate-700">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment && <p className="text-sm text-slate-700 mt-1">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
