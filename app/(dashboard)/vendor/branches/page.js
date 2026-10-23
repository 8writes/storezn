"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { EmptyState } from "@/components/ui/EmptyState.js";

const EMPTY_FORM = { name: "", address: "" };

export default function VendorBranchesPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const { storeId, loading: storeLoading } = useVendorStore();

  const [branches, setBranches] = useState(null);
  const [maxBranches, setMaxBranches] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/branches`)
      .then((data) => {
        setBranches(data.branches);
        setMaxBranches(data.max);
      })
      .catch((err) => toast.error(err.message || "Failed to load branches"));
  };

  useEffect(load, [token, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Owner-only, same as /vendor/staff.
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-800">This page is only available to the store owner.</p>;
  }

  const add = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const payload = { name: form.name };
      if (form.address.trim()) payload.address = form.address.trim();
      await apiFetch(`/api/v1/vendor/stores/${storeId}/branches`, { method: "POST", body: JSON.stringify(payload) });
      toast.success(`${form.name} added`);
      setForm(EMPTY_FORM);
      setAddOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to add branch");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (branch) => {
    const ok = await confirm({
      title: `Delete ${branch.name}?`,
      description: "This can't be undone. The branch must have no staff, no orders in progress, and no stock first.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setRemovingId(branch.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/branches/${branch.id}`, { method: "DELETE" });
      toast.success("Branch deleted");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to delete branch");
    } finally {
      setRemovingId(null);
    }
  };

  const atLimit = (branches?.length ?? 0) >= maxBranches;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Branches</h1>
          <p className="mt-1 text-sm text-slate-700">Each location keeps its own stock and staff. Customers don&apos;t see this.</p>
        </div>
        {!atLimit && branches !== null && (
          <Button onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
            <Plus size={16} /> Add branch
          </Button>
        )}
      </div>

      <p className="text-sm text-slate-600">{branches?.length ?? 0} of {maxBranches} branch{maxBranches === 1 ? "" : "es"} used</p>

      {atLimit && (
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {maxBranches <= 1 ? (
            <>
              The free plan has 1 branch.{" "}
              <Link href="/vendor/plus" className="font-semibold underline">Upgrade to Storezn+</Link> for more.
            </>
          ) : (
            "All your branches are used. Delete one to add another."
          )}
        </div>
      )}

      {storeLoading || branches === null ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => <div key={i} className="h-16 rounded-sm border border-slate-200 bg-surface animate-pulse" />)}
        </div>
      ) : branches.length === 0 ? (
        <EmptyState icon={Building2} title="No branches yet" description="Add a branch when you sell from more than one location." />
      ) : (
        <ul className="space-y-2">
          {branches.map((branch) => (
            <li key={branch.id} className="flex items-start justify-between gap-3 rounded-sm border border-slate-200 bg-surface p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-brand-100 text-brand-700"><Building2 size={17} /></span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <span className="truncate">{branch.name}</span>
                    {branch.isDefault && <Badge color="slate">Main</Badge>}
                  </p>
                  <p className="text-sm text-slate-600 break-words">{branch.address || "No address added"}</p>
                </div>
              </div>
              {!branch.isDefault && (
                <button
                  type="button"
                  disabled={removingId === branch.id}
                  onClick={() => remove(branch)}
                  aria-label={`Delete ${branch.name}`}
                  className="shrink-0 p-2 text-slate-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={adding ? undefined : () => setAddOpen(false)} />
          <form onSubmit={add} className="relative z-10 w-full sm:max-w-md rounded-t-sm sm:rounded-sm bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">Add branch</h2>
              <button type="button" onClick={() => setAddOpen(false)} disabled={adding} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-4">
              <Input label="Name" placeholder="e.g. Ikeja branch" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <Input label="Address (optional)" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-4">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
              <Button type="submit" loading={adding}>Add branch</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
