"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

const EMPTY_PASSWORD_FORM = { currentPassword: "", newPassword: "" };

// Role-agnostic - works the same for a vendor or a super_admin, since
// both are just `users` rows with the same profile/notification fields.
export default function ProfilePage() {
  const { user, token, updateUser } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

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

  if (!form) return null;

  return (
    <div className="space-y-6 max-w-xl">
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
        <label className="flex items-center justify-between gap-4 text-sm text-slate-600 cursor-pointer">
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
    </div>
  );
}
