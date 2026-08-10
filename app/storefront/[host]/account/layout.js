"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AccountLayout({ children }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/account/orders", label: "Orders" },
    { href: "/account/addresses", label: "Addresses" },
    { href: "/account/profile", label: "Profile" },
  ];

  return (
    <div className="space-y-8">
      <div className="max-w-xl mx-auto flex gap-6 border-b border-slate-200">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pathname.startsWith(t.href) ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
