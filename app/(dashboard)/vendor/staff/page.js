"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { formatDate } from "@/lib/format.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", branchId: "" };

export default function VendorStaffPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const { storeId, loading: storeLoading } = useVendorStore();

  const [staff, setStaff] = useState(null);
  const [maxStaff, setMaxStaff] = useState(1);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [branchBusyId, setBranchBusyId] = useState(null);

  const load = () => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/staff`)
      .then((data) => {
        setStaff(data.staff);
        setMaxStaff(data.max);
        setBranches(data.branches || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load staff"));
  };

  useEffect(load, [token, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team management is owner-only (see isStoreOwner in lib/auth.js) - a
  // staff member landing here directly would just get a 401 from the API
  // above, this just skips the confusing empty form for them.
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-800">This page is only available to the store owner.</p>;
  }

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      const payload = { ...form };
      if (!payload.branchId) delete payload.branchId;
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff`, { method: "POST", body: JSON.stringify(payload) });
      toast.success(`Invite sent to ${form.email}`);
      setForm(EMPTY_FORM);
      setInviteOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviting(false);
    }
  };

  const changeBranch = async (member, branchId) => {
    if ((branchId || null) === (member.branchId || null)) return;
    setBranchBusyId(member.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ branchId: branchId || null }),
      });
      toast.success("Branch updated");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update branch");
    } finally {
      setBranchBusyId(null);
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${member.firstName || member.email}?`,
      description: "They'll immediately lose access to this store's dashboard.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    setRemovingId(member.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff/${member.id}`, { method: "DELETE" });
      toast.success("Staff member removed");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to remove staff member");
    } finally {
      setRemovingId(null);
    }
  };

  const atLimit = (staff?.length ?? 0) >= maxStaff;
  const branchOptions = [{ value: "", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Staff</h1>
          <p className="mt-1 text-sm text-slate-700">People who help run your store. They can&apos;t see payouts or this list.</p>
        </div>
        {!atLimit && staff !== null && (
          <Button onClick={() => setInviteOpen(true)} className="w-full sm:w-auto">
            <UserPlus size={16} /> Invite staff
          </Button>
        )}
      </div>

      <p className="text-sm text-slate-600">
        {staff?.length ?? 0} of {maxStaff} staff seat{maxStaff === 1 ? "" : "s"} used
      </p>

      {atLimit && (
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {maxStaff <= 1 ? (
            <>
              The free plan has 1 staff seat.{" "}
              <Link href="/vendor/plus" className="font-semibold underline">Upgrade to Storezn+</Link> for more.
            </>
          ) : (
            "All your staff seats are used. Remove someone to invite another person."
          )}
        </div>
      )}

      {storeLoading || staff === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 rounded-sm border border-slate-200 bg-surface animate-pulse" />)}
        </div>
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Invite someone to help with products, orders and customers."
          action={!atLimit ? <Button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite staff</Button> : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {staff.map((member) => (
            <li key={member.id} className="rounded-sm border border-slate-200 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{member.firstName} {member.lastName}</p>
                  <p className="text-sm text-slate-600 truncate">{member.email}</p>
                  <p className="mt-1 text-xs text-slate-500">Added {formatDate(member.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {member.activatedAt ? <Badge color="green">Active</Badge> : <Badge color="amber">Invite sent</Badge>}
                  <button
                    type="button"
                    disabled={removingId === member.id}
                    onClick={() => remove(member)}
                    aria-label={`Remove ${member.firstName}`}
                    className="p-2 text-slate-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {branches.length > 1 && (
                <div className="mt-3 sm:max-w-xs">
                  <Select
                    label="Works at"
                    value={member.branchId || ""}
                    onChange={(v) => changeBranch(member, v)}
                    disabled={branchBusyId === member.id}
                    options={branchOptions}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={inviting ? undefined : () => setInviteOpen(false)} />
          <form onSubmit={invite} className="relative z-10 w-full sm:max-w-md rounded-t-sm sm:rounded-sm bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h2 className="font-semibold text-slate-900">Invite staff</h2>
                <p className="mt-0.5 text-sm text-slate-600">We&apos;ll email them a link to set their password.</p>
              </div>
              <button type="button" onClick={() => setInviteOpen(false)} disabled={inviting} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" autoComplete="off" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
                <Input label="Last name" autoComplete="off" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
              </div>
              <Input label="Email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              {branches.length > 1 && (
                <Select
                  label="Branch"
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  value={form.branchId}
                  onChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
                  required
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-4">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
              <Button type="submit" loading={inviting}>Send invite</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
