"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth.js";

const REDIRECT_BY_ROLE = {
  super_admin: "/super-admin/analytics",
  vendor: "/vendor/dashboard",
  staff: "/vendor/dashboard",
};

// Every role has a more specific landing page - this route only exists
// so /login's default `next` target has somewhere role-agnostic to send
// people, then immediately hands off.
export default function DashboardPage() {
  const { user } = useAuth(true);
  const router = useRouter();

  useEffect(() => {
    if (user && REDIRECT_BY_ROLE[user.role]) router.replace(REDIRECT_BY_ROLE[user.role]);
  }, [user, router]);

  return null;
}
