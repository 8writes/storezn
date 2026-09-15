"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";

export function CartBadge() {
  const { token, loading } = useCustomerAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (loading) return;
    const load = () => {
      fetch("/api/v1/storefront/cart", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.json())
        .then((data) => setCount(data.itemCount || 0))
        .catch(() => {});
    };
    load();
    window.addEventListener("cart:updated", load);
    return () => window.removeEventListener("cart:updated", load);
  }, [loading, token]);

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
