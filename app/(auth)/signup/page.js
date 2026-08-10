"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

const EMPTY_FORM = {
  name: "",
  slug: "",
  vendor: { firstName: "", lastName: "", email: "", password: "" },
  acceptTerms: false,
};

export default function VendorSignupPage() {
  const { login } = useAuth(false);
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setVendorField = (key) => (e) => setForm((f) => ({ ...f, vendor: { ...f.vendor, [key]: e.target.value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.acceptTerms) {
      toast.error("You must accept the Terms of Service to continue");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/vendor/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.vendor.email, password: form.vendor.password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.error || "Account created - please sign in");

      toast.success("Store created!");
      login(loginData.token, loginData.user);
      router.replace("/vendor/dashboard");
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Start selling</h2>
        <p className="text-sm text-slate-500 mt-1">Create your store in a couple of minutes.</p>
      </div>

      <Input label="Store name" value={form.name} onChange={setField("name")} required />
      <Input
        label="Store URL"
        placeholder="janes-boutique"
        value={form.slug}
        onChange={setField("slug")}
        required
      />

      <div className="pt-2 border-t border-slate-100 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="First name" value={form.vendor.firstName} onChange={setVendorField("firstName")} required />
          <Input label="Last name" value={form.vendor.lastName} onChange={setVendorField("lastName")} required />
        </div>
        <Input label="Email" type="email" value={form.vendor.email} onChange={setVendorField("email")} required autoComplete="email" />
        <PasswordInput label="Password" value={form.vendor.password} onChange={setVendorField("password")} required minLength={8} autoComplete="new-password" />
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.acceptTerms}
          onChange={(e) => setForm((f) => ({ ...f, acceptTerms: e.target.checked }))}
          className="mt-0.5"
          required
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="text-brand-600 hover:underline">
            Terms of Service
          </Link>
        </span>
      </label>

      <Button type="submit" loading={loading} fullWidth size="lg">
        Create my store
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
