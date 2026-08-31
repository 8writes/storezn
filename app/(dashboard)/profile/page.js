"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

const EMPTY_PASSWORD_FORM = { currentPassword: "", newPassword: "" };

// Role-agnostic for the profile/password/notification fields - works the
// same for a vendor, staff, or a super_admin, whichever of users/staff/
// customers the signed-in principal's row actually lives in (see
// lib/auth.js's getUser, PATCH /api/v1/auth/me). The "Leave store" card
// below is staff-only.
export default function ProfilePage() {
  const { user, token, logout, updateUser } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
    });
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, phone: form.phone }),
      });
      updateUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotifications = async (checked) => {
    setForm((f) => ({ ...f, emailNotificationsEnabled: checked }));
    setNotifSaving(true);
    try {
      const data = await apiFetch("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ emailNotificationsEnabled: checked }),
      });
      updateUser(data.user);
    } catch (err) {
      toast.error(err.message || "Failed to update notification setting");
      setForm((f) => ({ ...f, emailNotificationsEnabled: !checked }));
    } finally {
      setNotifSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangingPassword(true);
    try {
      await apiFetch("/api/v1/auth/me", { method: "PATCH", body: JSON.stringify(passwordForm) });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      toast.success("Password changed");
    } catch (err) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await apiFetch("/api/v1/vendor/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
      toast.success("Your account has been deleted");
      logout();
    } catch (err) {
      toast.error(err.message || "Failed to delete account");
      setDeleting(false);
    }
  };

  const handleLeaveStore = async () => {
    const ok = await confirm({
      title: "Leave this store?",
      description: "You'll lose access immediately. The store owner can re-invite you later if needed.",
      confirmLabel: "Leave store",
      variant: "danger",
    });
    if (!ok) return;

    setLeaving(true);
    try {
      await apiFetch("/api/v1/vendor/staff/me", { method: "DELETE" });
      toast.success("You've left the store");
      logout();
    } catch (err) {
      toast.error(err.message || "Failed to leave the store");
      setLeaving(false);
    }
  };

  if (!form) return null;

  return (
    <div className="space-y-6 max-w-xl">
      {confirmDialog}
      <h1 className="text-xl font-bold text-slate-900">Profile</h1>

      <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Your details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
          <Input label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
        </div>
        <Input label="Email" value={user.email} disabled />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <Button type="submit" loading={saving}>Save</Button>
      </form>

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Notifications</p>
        <label className="flex items-center justify-between gap-4 text-sm text-slate-700 cursor-pointer">
          <span>Email me about order updates</span>
          <input
            type="checkbox"
            checked={form.emailNotificationsEnabled}
            disabled={notifSaving}
            onChange={(e) => handleToggleNotifications(e.target.checked)}
          />
        </label>
      </div>

      <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Change password</p>
        <PasswordInput
          label="Current password"
          value={passwordForm.currentPassword}
          onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
          autoComplete="current-password"
          required
        />
        <PasswordInput
          label="New password"
          value={passwordForm.newPassword}
          onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Button type="submit" loading={changingPassword}>Change password</Button>
      </form>

      {user.role === "staff" && (
        <div className="bg-white border border-red-200 rounded-sm p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Leave this store</p>
            <p className="text-xs text-slate-500 mt-1">You&apos;ll lose access to this store&apos;s dashboard immediately.</p>
          </div>
          <Button type="button" variant="danger" loading={leaving} onClick={handleLeaveStore}>Leave store</Button>
        </div>
      )}

      {user.role === "vendor" && (
        <div className="bg-white border border-red-200 rounded-sm p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Delete account</p>
            <p className="text-xs text-slate-500 mt-1">
              Permanently removes your account and every store you own - all products, photos, categories, branches,
              staff, orders, and subscription history. This can&apos;t be undone.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setDeletePassword("");
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            Delete my account
          </Button>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => !deleting && setDeleteOpen(false)} />
          <div className="relative bg-white rounded-sm shadow-xl w-full max-w-md p-6 space-y-4 my-auto">
            <p className="text-sm font-semibold text-slate-900">Delete your account?</p>
            <p className="text-sm text-slate-600">
              This permanently deletes your account and <strong>every store you own</strong>, including all products and
              their photos, categories, branches, staff, orders, reviews and subscription history. There is no way to
              recover it.
            </p>
            <PasswordInput
              label="Confirm your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Type <span className="font-mono text-red-600">DELETE</span> to confirm
              </label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                disabled={!deletePassword || deleteConfirm !== "DELETE"}
                onClick={handleDeleteAccount}
              >
                Permanently delete
              </Button>
              <Button type="button" variant="secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
