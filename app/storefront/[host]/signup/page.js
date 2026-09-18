"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";
import { deviceHeaders } from "@/lib/clientDevice.js";
import { BannedNotice } from "@/components/BannedNotice.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", password: "", acceptMarketing: false };

export default function StorefrontSignupPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [banned, setBanned] = useState(null);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeaders() },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.banned) {
          setBanned({ reason: data.reason || null });
          return;
        }
        throw new Error(data.error || "Signup failed");
      }

      // No auto-login - login now requires a verified email, and the
      // account can't be verified yet (that link just landed in their
      // inbox), so a login attempt right here would just fail.
      setCreated(true);
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (banned) return <BannedNotice reason={banned.reason} />;

  if (created) {
    return (
      <div className="max-w-sm mx-auto py-8 space-y-5 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
          <p className="mt-1 text-sm text-slate-700">We sent a verification link to:</p>
        </div>
        <p className="break-all rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{form.email}</p>
        <p className="text-sm leading-6 text-slate-800">Open the email and select <strong>Verify email</strong>. Then return here and sign in.</p>
        <p className="text-xs leading-5 text-slate-600">No email yet? Check your spam or junk folder. You can also request a new link from the sign-in page.</p>
        <Link href="/login" className="inline-block text-sm font-semibold text-brand-700 underline underline-offset-2">I&apos;ve verified my email - sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-center">Create an account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First name" value={form.firstName} onChange={setField("firstName")} required />
          <Input label="Last name" value={form.lastName} onChange={setField("lastName")} required />
        </div>
        <Input label="Email" type="email" value={form.email} onChange={setField("email")} required autoComplete="email" />
        <PasswordInput label="Password" value={form.password} onChange={setField("password")} required minLength={8} autoComplete="new-password" />
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.acceptMarketing}
            onChange={(e) => setForm((f) => ({ ...f, acceptMarketing: e.target.checked }))}
            className="mt-0.5"
          />
          <span>I want to receive occasional marketing emails. You can unsubscribe at any time.</span>
        </label>
        <Button type="submit" fullWidth size="lg" loading={loading}>Create account</Button>
      </form>
      <p className="text-center text-sm text-slate-800">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-900 underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}
