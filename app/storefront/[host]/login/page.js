"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

export default function StorefrontLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useCustomerAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnverified(false);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
        throw new Error(data.error || "Login failed");
      }

      login(data.token, data.user);
      router.push(`/${searchParams.get("next") || ""}`);
    } catch (err) {
      toast.error(err.message || "Login failed");
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
    } catch {
      toast.error("Something went wrong");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-center">Sign in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required autoComplete="email" />
        <PasswordInput label="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required autoComplete="current-password" />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Forgot your password?</Link>
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
      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/signup" className="text-slate-900 underline underline-offset-2">Create an account</Link>
      </p>
    </div>
  );
}
