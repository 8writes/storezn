"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

export function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => {
      fetch("/api/v1/storefront/cart")
        .then((res) => res.json())
        .then((data) => setCount(data.itemCount || 0))
        .catch(() => {});
    };
    load();
    window.addEventListener("cart:updated", load);
    return () => window.removeEventListener("cart:updated", load);
  }, []);

  return (
    <Link href="/cart" className="relative flex items-center">
      <ShoppingCart size={20} />
      {count > 0 && (
        <span className="absolute -top-2 -right-2 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}
