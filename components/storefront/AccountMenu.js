"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut, ChevronDown } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";

// Signed-out state is just a plain sign-in icon/link. Signed-in swaps it
// for the shopper's initial in a circle plus a dropdown (orders/addresses/
// profile/sign out) - the only visual cue anywhere in the header that
// they're actually logged in, see useCustomerAuth.js for how that session
// is scoped per-store.
export function AccountMenu() {
  const router = useRouter();
  const { user, loading, logout } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (loading) return <span className="h-7 w-7 rounded-full bg-slate-100 animate-pulse" />;

  if (!user) {
    return (
      <Link href="/login" aria-label="Sign in" className="hover:text-slate-900 transition-colors">
        <User size={19} />
      </Link>
    );
  }

  const handleLogout = () => {
    setOpen(false);
    logout();
    router.push("/");
  };

  const initial = (user.firstName || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-slate-900 text-white text-xs font-semibold">{initial}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 shadow-lg z-20 py-1">
          <p className="px-3 py-2 text-sm text-slate-800 border-b border-slate-100 truncate">
            {user.firstName ? `Hi, ${user.firstName}` : user.email}
          </p>
          <Link href="/account/orders" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Orders
          </Link>
          <Link href="/account/addresses" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Addresses
          </Link>
          <Link href="/account/profile" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Profile
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
