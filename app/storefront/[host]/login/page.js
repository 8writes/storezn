"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";
import { networkErrorMessage, serverErrorMessage, readJson } from "@/lib/fetchError.js";
import { deviceHeaders } from "@/lib/clientDevice.js";
import { BannedNotice } from "@/components/BannedNotice.js";

export default function StorefrontLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useCustomerAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [banned, setBanned] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnverified(false);

    let res;
    try {
      res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeaders() },
        body: JSON.stringify(form),
      });
    } catch (err) {
      toast.error(networkErrorMessage(err) || "Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
      return;
    }

    try {
      const data = await readJson(res);
      if (!res.ok) {
        if (data?.banned) {
          setBanned({ reason: data.reason || null });
          return;
        }
        if (data?.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
        toast.error(data?.error || serverErrorMessage(res.status));
        return;
      }
      if (!data?.token) {
        toast.error(serverErrorMessage(res.status || 500));
        return;
      }

      login(data.token, data.user);
      router.push(`/${searchParams.get("next") || ""}`);
    } catch {
      toast.error("Something went wrong. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      toast.success("If that account needs verifying, a new link is on its way");
    } catch (err) {
      toast.error(networkErrorMessage(err) || "Couldn't send the link. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  if (banned) return <BannedNotice reason={banned.reason} />;

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-center">Sign in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required autoComplete="email" />
        <PasswordInput label="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required autoComplete="current-password" />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-slate-800 hover:text-slate-900 transition-colors">Forgot your password?</Link>
        </div>
        {unverified && (
          <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-sm text-amber-800 flex items-center justify-between gap-3">
            <span>Email not verified yet.</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium underline underline-offset-2 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {resending ? "Sending…" : "Resend link"}
            </button>
          </div>
        )}
        <Button type="submit" fullWidth size="lg" loading={loading}>Sign in</Button>
      </form>
      <p className="text-center text-sm text-slate-800">
        New here?{" "}
        <Link href="/signup" className="text-slate-900 underline underline-offset-2">Create an account</Link>
      </p>
    </div>
  );
}
