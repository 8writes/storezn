"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { Badge } from "@/components/ui/Badge.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { isEnterpriseStore } from "@/lib/storePlan.js";
import { Calculator, Trash2, Pencil, Plus, History, X } from "lucide-react";
import { FeatureLocked } from "@/components/ui/FeatureLocked.js";

export default function RegistersPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [branches, setBranches] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [creating, setCreating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // { id, name } while the rename sheet is open.
  const [renaming, setRenaming] = useState(null);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores[0]) setStoreId(data.stores[0].id);
        else setLoading(false);
      })
      .catch((err) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // One fetch path, cancellable. `loading` starts true and is only cleared
  // when a fetch settles; `refresh()` turns it back on after a mutation,
  // rather than it being set synchronously inside this effect.
  useEffect(() => {
    if (!storeId) return undefined;
    let alive = true;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/branches`),
    ])
      .then(([r, b]) => {
        if (!alive) return;
        setRegisters(r.registers);
        setBranches(b.branches);
        // Only auto-pick when there's nothing to choose - on a
        // multi-branch store the till must be placed deliberately (a
        // silent default is how "Front Counter - Eliozu" ended up on the
        // main branch), and the submit button already blocks on !branchId.
        setBranchId((cur) => cur || (b.branches.length === 1 ? b.branches[0]?.id || "" : ""));
      })
      // A 402 just means the store isn't on Enterprise - the page already
      // renders the upsell for that, no toast needed.
      .catch((err) => {
        if (!alive) return;
        if (err?.status !== 402) toast.error(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, storeId, refreshKey]);

  // Re-runs the effect above after a mutation, in place of calling the
  // fetch directly from a handler.
  const refresh = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const store = stores.find((s) => s.id === storeId);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers`, {
        method: "POST",
        body: JSON.stringify({ name, branchId }),
      });
      setName("");
      setAddOpen(false);
      refresh();
      toast.success("Register added");
    } catch (err) {
      toast.error(err.message || "Couldn't add the register");
    } finally {
      setCreating(false);
    }
  };

  const rename = async () => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers/${renaming.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renaming.name.trim() }),
      });
      setRenaming(null);
      refresh();
      toast.success("Register renamed");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const retire = async (register) => {
    const ok = await confirm({
      title: `Remove ${register.name}?`,
      description: "Cashiers won't be able to open a shift on it. Its past shifts and sales are kept.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers/${register.id}`, { method: "DELETE" });
      refresh();
      toast.success("Register removed");
    } catch (err) {
      toast.error(err.message || "Couldn't remove it");
    }
  };

  if (user && user.role !== "vendor" && user.role !== "super_admin") {
    return <p className="text-sm text-slate-700">Only the store owner manages registers.</p>;
  }

  if (!loading && store && !isEnterpriseStore(store)) {
    return (
      <FeatureLocked
        plan="enterprise"
        feature="Registers"
        description="Enterprise adds the full in-person point-of-sale suite."
        backHref="/vendor/orders"
        backLabel="Back to orders"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Registers</h1>
          <p className="mt-1 text-sm text-slate-700">Each till at your branches. Cashiers open a shift on one from the Sell screen.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href="/vendor/pos/sessions" className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-400">
            <History size={15} /> Shift history
          </Link>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add register
          </Button>
        </div>
      </div>

      {stores.length > 1 && (
        <div className="sm:w-56">
          <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 rounded-sm border border-slate-200 bg-surface animate-pulse" />)}
        </div>
      ) : registers.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No registers yet"
          description="Add one for each till or checkout point your team uses."
          action={<Button onClick={() => setAddOpen(true)}><Plus size={16} /> Add register</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {registers.map((r) => (
            <li key={r.id} className={`rounded-sm border bg-surface p-4 ${r.isActive ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-brand-100 text-brand-700"><Calculator size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{r.name}</p>
                  <p className="text-sm text-slate-600 truncate">{r.branchName || "No branch"}</p>
                  <div className="mt-2">
                    {!r.isActive ? (
                      <Badge color="slate">Removed</Badge>
                    ) : r.openSession ? (
                      <Badge color="green">Shift open</Badge>
                    ) : (
                      <Badge color="slate">Closed</Badge>
                    )}
                  </div>
                </div>
                {r.isActive && (
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => setRenaming({ id: r.id, name: r.name })} aria-label={`Rename ${r.name}`} className="p-2 text-slate-500 hover:text-slate-900 cursor-pointer">
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => retire(r)} aria-label={`Remove ${r.name}`} className="p-2 text-slate-500 hover:text-red-600 cursor-pointer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(addOpen || renaming) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setAddOpen(false); setRenaming(null); }} />
          {renaming ? (
            <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="relative z-10 w-full sm:max-w-md rounded-t-sm sm:rounded-sm bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <h2 className="font-semibold text-slate-900">Rename register</h2>
                <button type="button" onClick={() => setRenaming(null)} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"><X size={20} /></button>
              </div>
              <div className="p-4">
                <Input label="Name" value={renaming.name} onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))} autoFocus required />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-4">
                <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
                <Button type="submit" disabled={!renaming.name.trim()}>Save</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={create} className="relative z-10 w-full sm:max-w-md rounded-t-sm sm:rounded-sm bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <h2 className="font-semibold text-slate-900">Add register</h2>
                <button type="button" onClick={() => setAddOpen(false)} disabled={creating} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"><X size={20} /></button>
              </div>
              <div className="space-y-4 p-4">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front counter" autoFocus required />
                {branches.length > 1 && (
                  <div className="space-y-1">
                    <Select
                      label="Branch"
                      value={branchId}
                      onChange={setBranchId}
                      options={[{ value: "", label: "Choose a branch…" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                    />
                    <p className="text-xs text-slate-600">Sales on this till take stock from this branch.</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-4">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>Cancel</Button>
                <Button type="submit" loading={creating} disabled={!name.trim() || !branchId}>Add register</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
