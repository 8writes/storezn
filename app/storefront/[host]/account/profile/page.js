"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { Input } from "@/components/ui/Input.js";
import { PasswordInput } from "@/components/ui/PasswordInput.js";
import { Button } from "@/components/ui/Button.js";

const EMPTY_PASSWORD_FORM = { currentPassword: "", newPassword: "" };

export default function CustomerProfilePage() {
  const router = useRouter();
  const { user, token, loading: authLoading, login, updateUser } = useCustomerAuth();

  // The form is a view of the account until it's edited, then it's the
  // edit in progress. Deriving it removes the mount-time effect that
  // copied `user` into state - which also meant a background refresh of
  // `user` could overwrite what someone was in the middle of typing.
  const [edited, setEdited] = useState(null);
  const form =
    edited ??
    (user
      ? {
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
          emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
        }
      : null);
  const setForm = (next) => setEdited((current) => (typeof next === "function" ? next(current ?? form) : next));
  const [saving, setSaving] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [changingPassword, setChangingPassword] = useState(false);

  // Signed-out visitors are sent to the store's login page. The form
  // itself is derived above, so this effect only navigates.
  useEffect(() => {
    if (authLoading || user) return;
    router.replace("/login?next=account/profile");
  }, [authLoading, user, router]);

  const call = (body) =>
    fetch("/api/v1/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    });

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await call({ firstName: form.firstName, lastName: form.lastName, phone: form.phone });
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
      const data = await call({ emailNotificationsEnabled: checked });
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
      // The server rotates the token on a password change (every older
      // one is now dead), so adopt the new one instead of being signed
      // out of the page we're standing on.
      const data = await call(passwordForm);
      if (data?.token) login(data.token, user);
      setPasswordForm(EMPTY_PASSWORD_FORM);
      toast.success("Password changed");
    } catch (err) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  if (authLoading || !form) return <p className="text-center text-slate-700 py-20">Loading…</p>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>

      <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
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
        <PasswordInput label="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))} autoComplete="current-password" required />
        <PasswordInput label="New password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))} autoComplete="new-password" minLength={8} required />
        <Button type="submit" loading={changingPassword}>Change password</Button>
      </form>
    </div>
  );
}
