"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";

const EMPTY_FORM = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", isDefault: false };

export default function CustomerAddressesPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useCustomerAuth();
  const { confirm, confirmDialog } = useConfirm();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/customer/addresses", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setAddresses(data.addresses || []))
      .catch(() => toast.error("Could not load your addresses"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=account/addresses");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Address added");
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.message || "Could not save address");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: "Remove this address?", variant: "danger" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/customer/addresses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) {
      toast.error(err.message || "Could not remove address");
    }
  };

  if (authLoading || loading) return <p className="text-center text-slate-400 py-20">Loading…</p>;
  if (!user) return null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {confirmDialog}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your addresses</h1>

      {addresses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-sm divide-y divide-slate-100">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start justify-between p-4">
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-900">{a.fullName} {a.isDefault && <Badge color="green">Default</Badge>}</p>
                <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
                <p>{a.city}, {a.state}</p>
                <p>{a.phone}</p>
              </div>
              <button type="button" onClick={() => handleDelete(a.id)} className="text-sm text-red-600 hover:underline cursor-pointer">Remove</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Add a new address</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
          <Input label="Address line 1" className="sm:col-span-2" value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} required />
          <Input label="Address line 2 (optional)" className="sm:col-span-2" value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} />
          <Select
            label="State"
            options={NIGERIA_STATE_OPTIONS}
            value={form.state}
            onChange={(v) => setForm((f) => ({ ...f, state: v, city: "" }))}
            required
          />
          <Select
            label="City/LGA"
            options={getLgaOptions(form.state)}
            value={form.city}
            onChange={(v) => setForm((f) => ({ ...f, city: v }))}
            disabled={!form.state}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
          Set as default address
        </label>
        <Button type="submit" loading={submitting}>Save address</Button>
      </form>
    </div>
  );
}
