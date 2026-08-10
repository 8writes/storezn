"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", password: "" };

export default function StorefrontSignupPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

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

  if (created) {
    return (
      <div className="max-w-sm mx-auto py-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-500">
          We&apos;ve sent a verification link to <strong>{form.email}</strong>. Verify it, then sign in.
        </p>
        <Link href="/login" className="block text-sm text-slate-900 underline underline-offset-2">Sign in</Link>
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
        <Button type="submit" fullWidth size="lg" loading={loading}>Create account</Button>
      </form>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-900 underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}
