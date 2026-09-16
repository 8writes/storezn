"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      toast.success("Password reset - sign in with your new password.");
      router.replace("/login");
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-sm mx-auto py-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Invalid link</h1>
        <p className="text-sm text-slate-800">This password reset link is missing its token.</p>
        <Link href="/forgot-password" className="block text-sm text-slate-900 underline underline-offset-2">Request a new link</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-center">Set a new password</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>Reset password</Button>
      </form>
    </div>
  );
}

export default function StorefrontResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-sm mx-auto py-8 space-y-5 animate-pulse">
          <div className="h-8 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
