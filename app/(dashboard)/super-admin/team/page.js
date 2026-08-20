"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDate } from "@/lib/format.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", role: "admin" };
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - everything except platform settings" },
  { value: "p_staff", label: "Platform staff - products, view orders/transactions" },
];
const ROLE_LABEL = { admin: "Admin", p_staff: "Platform staff" };

export default function SuperAdminTeamPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [team, setTeam] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = () => {
    apiFetch("/api/v1/super-admin/team")
      .then((data) => setTeam(data.team))
      .catch((err) => toast.error(err.message || "Failed to load team"));
  };

  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      await apiFetch("/api/v1/super-admin/team", { method: "POST", body: JSON.stringify(form) });
      toast.success(`Invite sent to ${form.email}`);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to invite team member");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member, role) => {
    if (role === member.role) return;
    setUpdatingId(member.id);
    try {
      await apiFetch(`/api/v1/super-admin/team/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      toast.success("Role updated");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${member.firstName || member.email}?`,
      description: "They'll immediately lose access to the platform dashboard.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    setRemovingId(member.id);
    try {
      await apiFetch(`/api/v1/super-admin/team/${member.id}`, { method: "DELETE" });
      toast.success("Team member removed");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to remove team member");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500 mt-1">
          Invite admins and platform staff. Admin gets everything except platform settings; platform staff is scoped to products, with view-only orders and transactions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Team member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {team === null ? (
                <TableRowSkeleton cols={4} />
              ) : team.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No team members yet</td>
                </tr>
              ) : (
                team.map((member) => (
                  <tr key={member.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-slate-400">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[160px]">
                        <Select
                          value={member.role}
                          onChange={(v) => changeRole(member, v)}
                          options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: ROLE_LABEL[o.value] }))}
                          disabled={updatingId === member.id}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={removingId === member.id}
                        onClick={() => remove(member)}
                        className="inline-flex items-center gap-1.5 text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Invite team member</p>
          <form onSubmit={invite} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
              <Input label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
            </div>
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              required
            />
            <Button type="submit" loading={inviting} fullWidth>
              <UserPlus size={16} />
              Send invite
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
