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
    return <p className="text-center text-sm text-slate-800 py-10">Verifying your email…</p>;
  }

  if (status === "success") {
    return (
      <div className="max-w-sm mx-auto py-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Email verified</h1>
        <p className="text-sm text-slate-800">You&apos;re all set - you can sign in now.</p>
        <Link href="/login" className="block text-sm text-slate-900 underline underline-offset-2">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {status === "missing" ? "Missing verification link" : "Link expired or invalid"}
        </h1>
        <p className="text-sm text-slate-800">
          {status === "missing"
            ? "This page needs a verification link from your email."
            : "This verification link is no longer valid. Request a new one below."}
        </p>
      </div>

      {resent ? (
        <p className="text-center text-sm text-slate-800">If that email has an unverified account, a new link is on its way.</p>
      ) : (
        <form onSubmit={handleResend} className="space-y-4">
          <Input label="Email" type="email" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required autoComplete="email" />
          <Button type="submit" fullWidth size="lg" loading={resending}>Resend verification email</Button>
        </form>
      )}

      <Link href="/login" className="block text-center text-sm text-slate-900 underline underline-offset-2">Back to sign in</Link>
    </div>
  );
}

export default function StorefrontVerifyEmailPage() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-slate-800 py-10">Loading…</p>}>
      <VerifyEmailBody />
    </Suspense>
  );
}
