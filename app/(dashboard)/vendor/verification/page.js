"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

export default function VendorVerificationPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nin, setNin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiFetch("/api/v1/vendor/verification")
      .then(setStatus)
      .catch((err) => toast.error(err.message || "Failed to load verification status"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/v1/vendor/verification", { method: "POST", body: JSON.stringify({ nin }) });
      setStatus(data);
      setNin("");
      toast.success("NIN submitted for review");
    } catch (err) {
      toast.error(err.message || "Failed to submit NIN");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !status) return <FormSkeleton fields={3} />;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Verification</h1>
        <p className="text-sm text-slate-500 mt-1">
          You can set up your store and add products right away, but it won&apos;t be visible to customers or able to take orders until your identity is verified.
        </p>
      </div>

      {status.approvalStatus === "approved" && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-sm p-4 text-sm text-green-800">
          <div>
            <p className="font-medium">Verified</p>
            <p>Your identity has been verified and your store can take orders.</p>
          </div>
        </div>
      )}

      {status.approvalStatus === "pending" && status.nin && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4 text-sm text-amber-800">
          <Clock size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Under review</p>
            <p>NIN submitted {formatDateTime(status.ninSubmittedAt)}. We&apos;ll let you know once it&apos;s reviewed.</p>
          </div>
        </div>
      )}

      {status.approvalStatus === "rejected" && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <XCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Verification rejected</p>
            {status.approvalReviewNote && <p>{status.approvalReviewNote}</p>}
            <p className="mt-1">You can submit your NIN again below.</p>
          </div>
        </div>
      )}

      {status.approvalStatus !== "approved" && (!status.nin || status.approvalStatus === "rejected") && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <Input
            label="NIN (National Identification Number)"
            placeholder="12345678901"
            maxLength={11}
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))}
            required
          />
          <Button type="submit" loading={submitting}>Submit for review</Button>
        </form>
      )}
    </div>
  );
}
