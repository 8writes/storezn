"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { slugifyStoreName } from "@/lib/slugify.js";
import { NIGERIA_STATE_OPTIONS } from "@/lib/nigeria.js";
import { POST_AUTH_REDIRECT_KEY } from "@/lib/postAuthRedirect.js";
import { deviceHeaders } from "@/lib/clientDevice.js";
import { BannedNotice } from "@/components/BannedNotice.js";

const EMPTY_FORM = {
  name: "",
  slug: "",
  state: "",
  vendor: { firstName: "", lastName: "", email: "", password: "" },
  acceptTerms: false,
  acceptMarketing: false,
};

function VendorSignupForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [banned, setBanned] = useState(null);

  // Signup doesn't auto-login (email must be verified first, see below),
  // so a "?next=" here can't just be handed to a redirect the way
  // login's is - it has to survive signup -> verify email -> login as a
  // separate step. Stashed in localStorage, which outlives the query
  // string across that whole round trip, and read back on the eventual
  // successful login (see LoginForm in ../login/page.js).
  useEffect(() => {
    const next = searchParams.get("next");
    if (next) localStorage.setItem(POST_AUTH_REDIRECT_KEY, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-bold text-slate-900">Verify your email to continue</h2>
        <p className="text-sm text-slate-500">
          We&apos;ve sent a verification link to <strong>{form.vendor.email}</strong>. Open it and click the link to activate your account - you won&apos;t be able to sign in until you do.
        </p>
        <p className="text-sm text-slate-500">
          Don&apos;t see it? Check your spam or junk folder.
        </p>
        <Link href="/login" className="text-sm text-brand-600 hover:underline">Sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Start selling</h2>
        <p className="text-sm text-slate-500 mt-1">Create your store in a couple of minutes.</p>
      </div>

      <Input
        label="Store name"
        value={form.name}
        onChange={(e) => {
          const name = e.target.value;
          setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugifyStoreName(name) }));
        }}
        required
      />
      <Input
        label="Store URL"
        placeholder="janesboutique"
        value={form.slug}
        // Strips anything that isn't a-z/0-9 as the vendor types (no
        // hyphens - a store's slug becomes its actual subdomain, see
        // slugifyStoreName's own comment), rather than letting them type
        // "My Shop.com" and only finding out it's invalid after submit -
        // matches the server's own slug regex (see vendorSignupSchema in
        // lib/validate.js).
        onChange={(e) => {
          setSlugTouched(true);
          setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") }));
        }}
        required
      />
      <Select
        label="Store location"
        options={NIGERIA_STATE_OPTIONS}
        value={form.state}
        onChange={(v) => setForm((f) => ({ ...f, state: v }))}
        placeholder="Where do you ship from?"
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

      <label className="flex items-start gap-2 text-sm text-slate-700">
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
          {" "}and{" "}
          <Link href="/privacy" target="_blank" className="text-brand-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.acceptMarketing}
          onChange={(e) => setForm((f) => ({ ...f, acceptMarketing: e.target.checked }))}
          className="mt-0.5"
        />
        <span>
          I agree to receive occasional marketing emails from Storezn. You can unsubscribe at any time.
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

export default function VendorSignupPage() {
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
      <VendorSignupForm />
    </Suspense>
  );
}
