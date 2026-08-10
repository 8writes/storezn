"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../hooks/useAuth.js";
import { Input } from "../../../components/ui/Input.js";
import { PasswordInput } from "../../../components/ui/PasswordInput.js";
import { Button } from "../../../components/ui/Button.js";
import { toast } from "sonner";

function LoginForm() {
  const { login } = useAuth(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
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
        toast.error(data.error || "Login failed");
        if (data.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
        return;
      }

      toast.success("Login successful");
      login(data.token, data.user);
      router.replace(next);
    } catch {
      toast.error("Something went wrong");
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Welcome back</h2>
        <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
      </div>

      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        required
        autoComplete="email"
      />

      <PasswordInput
        label="Password"
        placeholder="••••••••"
        value={form.password}
        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        required
        autoComplete="current-password"
      />

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-brand-600 hover:underline">
          Forgot password?
        </Link>
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

      <Button type="submit" loading={loading} fullWidth size="lg">
        Sign In
      </Button>

      <p className="text-center text-sm text-slate-500">
        Want to get a free store?{" "}
        <Link href="/signup" className="text-brand-600 hover:underline">Create a store</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5 animate-pulse">
          <div className="h-8 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
