"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { isEnterpriseStore } from "@/lib/storePlan.js";
import { Calculator, Trash2, Check, X } from "lucide-react";

export default function RegistersPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [branches, setBranches] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

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

  const load = () => {
    if (!storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/branches`),
    ])
      .then(([r, b]) => {
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
        if (err?.status !== 402) toast.error(err.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
      load();
      toast.success("Register added");
    } catch (err) {
      toast.error(err.message || "Couldn't add the register");
    } finally {
      setCreating(false);
    }
  };

  const rename = async (id) => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName }),
      });
      setEditId(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const retire = async (id) => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers/${id}`, { method: "DELETE" });
      load();
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
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">Registers are a Storezn Enterprise feature</h1>
          <p className="text-sm text-slate-800 max-w-sm mx-auto">
            Enterprise adds the full in-person point-of-sale suite. It&apos;s set up by the Storezn team.
          </p>
          <Link href="/vendor/plus" className="inline-block">
            <Button type="button">See Enterprise</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackLink href="/vendor/orders" label="Back to orders" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Calculator size={18} className="text-brand-600" /> Registers
        </h1>
        <Link href="/vendor/pos/sessions" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          Session history &amp; Z reports
        </Link>
      </div>
      <p className="text-sm text-slate-800">
        A register is a till at a branch. Open a shift on it from the Sell screen, take payments, and close it out with a Z report.
      </p>

      {stores.length > 1 && (
        <div className="w-52">
          <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : registers.length === 0 ? (
          <div className="p-6 text-sm text-slate-800 text-center">No registers yet</div>
        ) : (
          registers.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                {editId === r.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                      autoFocus
                    />
                    <button type="button" onClick={() => rename(r.id)} className="text-emerald-600 cursor-pointer">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className="text-slate-400 cursor-pointer">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(r.id);
                      setEditName(r.name);
                    }}
                    className="text-sm font-medium text-slate-900 hover:text-brand-700 cursor-pointer"
                  >
                    {r.name}
                  </button>
                )}
                <p className="text-[11px] text-slate-800">
                  {r.branchName || "N/A"}
                  {r.openSession && <span className="text-emerald-600 font-medium"> · shift open</span>}
                  {!r.isActive && <span className="text-slate-400"> · retired</span>}
                </p>
              </div>
              <button type="button" onClick={() => retire(r.id)} className="text-slate-400 hover:text-red-600 cursor-pointer" title="Remove">
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={create} className="bg-surface border border-slate-200 rounded-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Add a register</p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Front counter" required />
        {branches.length > 1 && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Branch</label>
            <Select
              value={branchId}
              onChange={setBranchId}
              options={[{ value: "", label: "Choose a branch…" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
            <p className="text-xs text-slate-800">Sales rung up on this till count against this branch&apos;s stock.</p>
          </div>
        )}
        <Button type="submit" loading={creating} disabled={!name.trim() || !branchId}>
          Add register
        </Button>
      </form>
    </div>
  );
}
