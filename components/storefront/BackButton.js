"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// router.back() rather than a Link to the store's home page - a shopper
// who tapped in from a category/search listing should land back on that
// listing (with its scroll position and filters intact), not get bounced
// to "/" every time.
export function BackButton({ className = "" }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer ${className}`}
    >
      <ArrowLeft size={16} />
      Back
    </button>
  );
}
