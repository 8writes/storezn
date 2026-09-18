"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";

export default function StorefrontForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSent(true);
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-sm mx-auto py-8 space-y-5 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reset link sent</h1>
          <p className="mt-1 text-sm text-slate-700">If an account exists, we sent a password reset link to:</p>
        </div>
        <p className="break-all rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{email}</p>
        <p className="text-sm leading-6 text-slate-800">Open the email and select <strong>Reset password</strong>. Then choose a new password.</p>
        <p className="text-xs leading-5 text-slate-600">No email yet? Check your spam or junk folder, then try again.</p>
        <Link href="/login" className="inline-block text-sm font-semibold text-brand-700 underline underline-offset-2">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Forgot your password?</h1>
        <p className="text-sm text-slate-800">Enter your email and we&apos;ll send you a reset link.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Button type="submit" fullWidth size="lg" loading={loading}>Send reset link</Button>
      </form>

      <Link href="/login" className="block text-center text-sm text-slate-900 underline underline-offset-2">Back to sign in</Link>
    </div>
  );
}
