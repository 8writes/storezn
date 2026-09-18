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
        <p className="text-sm text-slate-800">Your account is active. You can sign in now.</p>
        <Link href="/login" className="block text-sm font-semibold text-brand-700 underline underline-offset-2">Continue to sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {status === "missing" ? "Open your verification email" : "Request a new verification link"}
        </h1>
        <p className="text-sm text-slate-800">
          {status === "missing"
            ? "Use the Verify email link we sent to your inbox. If you cannot find it, request a new link below."
            : "That link has expired or was already used. Enter your email below and we will send a new one."}
        </p>
      </div>

      {resent ? (
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-slate-900">Verification email sent</p>
          <p className="text-sm text-slate-700">Open the new email and select <strong>Verify email</strong>. Check spam or junk if it does not appear.</p>
        </div>
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
