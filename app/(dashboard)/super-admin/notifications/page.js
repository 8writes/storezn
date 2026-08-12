"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";

const CHANNEL_OPTIONS = [
  { value: "push", label: "Push notification only" },
  { value: "email", label: "Email only" },
  { value: "both", label: "Push notification + email" },
];

const TARGET_OPTIONS = [
  { value: "single", label: "One vendor" },
  { value: "all_vendors", label: "All vendors" },
];

export default function SuperAdminNotificationsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [vendors, setVendors] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState("push");
  const [target, setTarget] = useState("single");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/super-admin/notifications")
      .then((data) => setVendors(data.vendors))
      .catch((err) => toast.error(err.message || "Failed to load vendors"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const vendorOptions = vendors.map((v) => ({ value: v.id, label: `${v.firstName} ${v.lastName} (${v.email})` }));

  const send = async () => {
    if (target === "single" && !userId) {
      toast.error("Pick a vendor to send to");
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch("/api/v1/super-admin/notifications", {
        method: "POST",
        body: JSON.stringify({ title, body, url: url.trim() || undefined, channel, target, userId: target === "single" ? userId : undefined }),
      });
      const parts = [];
      if (channel !== "email") parts.push(`${data.push.sent} push sent${data.push.failed ? `, ${data.push.failed} failed` : ""}`);
      if (channel !== "push") parts.push(`${data.email.sent} email sent${data.email.failed ? `, ${data.email.failed} failed` : ""}`);
      toast.success(`Notified ${data.recipients} vendor${data.recipients === 1 ? "" : "s"} - ${parts.join(", ")}`);
      setTitle("");
      setBody("");
      setUrl("");
    } catch (err) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Notify vendors</h1>
        <p className="text-sm text-slate-500 mt-1">Send a custom push notification and/or email to one vendor or every vendor.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-lg space-y-4">
        <Select label="Send to" options={TARGET_OPTIONS} value={target} onChange={setTarget} searchable={false} />
        {target === "single" && (
          <Select label="Vendor" options={vendorOptions} value={userId} onChange={setUserId} placeholder="Choose a vendor" />
        )}
        <Select label="Channel" options={CHANNEL_OPTIONS} value={channel} onChange={setChannel} searchable={false} />
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Scheduled maintenance tonight" />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={4} placeholder="What do you want to tell them?" />
        {(channel === "push" || channel === "both") && (
          <Input
            label="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/vendor/orders"
          />
        )}
        <Button onClick={send} loading={sending} disabled={!title.trim() || !body.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
