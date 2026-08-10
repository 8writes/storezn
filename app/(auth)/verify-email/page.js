"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";

function VerifyEmailBody() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState(token ? "verifying" : "missing");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok }) => setStatus(ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    setResending(true);
    try {
      await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      setResent(true);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setResending(false);
    }
  };

  if (status === "verifying") {
    return <p className="text-center text-sm text-slate-500 py-10">Verifying your email…</p>;
  }

  if (status === "success") {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-bold text-slate-900">Email verified</h2>
        <p className="text-sm text-slate-500">You&apos;re all set - you can sign in now.</p>
        <Link href="/login" className="text-sm text-brand-600 hover:underline">Sign in</Link>
      </div>
    );
  }

  // status is "error" (invalid/expired token) or "missing" (no token in URL)
  return (
    <div className="space-y-5 text-center">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {status === "missing" ? "Missing verification link" : "Link expired or invalid"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {status === "missing"
            ? "This page needs a verification link from your email."
            : "This verification link is no longer valid. Request a new one below."}
        </p>
      </div>

      {resent ? (
        <p className="text-sm text-slate-500">If that email has an unverified account, a new link is on its way.</p>
      ) : (
        <form onSubmit={handleResend} className="space-y-3 text-left">
          <Input
            label="Email"
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Button type="submit" loading={resending} fullWidth>Resend verification email</Button>
        </form>
      )}

      <Link href="/login" className="block text-sm text-brand-600 hover:underline">Back to sign in</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-slate-500 py-10">Loading…</p>}>
      <VerifyEmailBody />
    </Suspense>
  );
}
