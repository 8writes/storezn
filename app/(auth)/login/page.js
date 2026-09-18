"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../hooks/useAuth.js";
import { Input } from "../../../components/ui/Input.js";
import { PasswordInput } from "../../../components/ui/PasswordInput.js";
import { Button } from "../../../components/ui/Button.js";
import { networkErrorMessage, serverErrorMessage, readJson } from "../../../lib/fetchError.js";
import { deviceHeaders } from "../../../lib/clientDevice.js";
import { BannedNotice } from "../../../components/BannedNotice.js";
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
  const [banned, setBanned] = useState(null); // { reason } | null

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
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
      // fetch() rejected - never reached the server (offline, DNS,
      // connection reset). Say so, rather than "something went wrong".
      toast.error(networkErrorMessage(err) || "Couldn't reach Storezn. Check your connection and try again.");
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
        toast.error(data?.error || serverErrorMessage(res.status));
        if (data?.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
        return;
      }
      if (!data?.token) {
        toast.error(serverErrorMessage(res.status || 500));
        return;
      }

      toast.success("Login successful");
      login(data.token, data.user);
      // A signup-time "?next=" (e.g. from the Storezn+ pricing card) is
      // handled once inside the vendor dashboard layout instead of here
      // (see app/(dashboard)/layout.js) - that's the one place it's safe
      // to apply regardless of the account's actual role, since it's
      // where VendorStoreProvider is already correctly wrapped.
      router.replace(next);
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Welcome back</h2>
        <p className="text-sm text-slate-800 mt-1">Sign in to your account</p>
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
          <span>Verify your email before signing in.</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-medium underline underline-offset-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {resending ? "Sending…" : "Send new link"}
          </button>
        </div>
      )}

      <Button type="submit" loading={loading} fullWidth size="lg">
        Sign In
      </Button>

      <p className="text-center text-sm text-slate-800">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-brand-600 hover:underline">Create an account</Link>
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
