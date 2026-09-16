"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";

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
    <div className="space-y-6">
      {confirmDialog}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Branches</h1>
        <p className="text-sm text-slate-800 mt-1">
          Track stock and staff separately per physical location. Buyers never see this - your storefront looks the same either way.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-800 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {storeLoading || branches === null ? (
                <TableRowSkeleton cols={3} />
              ) : branches.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">No branches yet</td>
                </tr>
              ) : (
                branches.map((branch) => (
                  <tr key={branch.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 flex items-center gap-1.5">
                        {branch.name}
                        {branch.isDefault && <Badge color="slate">Default</Badge>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{branch.address || "N/A"}</td>
                    <td className="px-4 py-3 text-right">
                      {!branch.isDefault && (
                        <button
                          type="button"
                          disabled={removingId === branch.id}
                          onClick={() => remove(branch)}
                          className="inline-flex items-center gap-1.5 text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">Add branch</p>
            <span className="text-xs text-slate-400">{branches?.length ?? 0} of {maxBranches}</span>
          </div>
          {atLimit ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-800">
                You&apos;ve reached the {maxBranches}-branch limit{maxBranches <= 1 ? " on the free plan" : ""}.{" "}
                {maxBranches <= 1 ? "Upgrade to Storezn+ for more branches." : "Delete one before adding another."}
              </p>
              {maxBranches <= 1 && (
                <Link href="/vendor/plus" className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Upgrade to Storezn+
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={add} className="space-y-4">
              <Input label="Name" placeholder="e.g. Ikeja branch" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <Input label="Address (optional)" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              <Button type="submit" loading={adding} fullWidth>
                <Plus size={16} />
                Add branch
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
