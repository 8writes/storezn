"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { formatDateTime } from "@/lib/format.js";
import { encryptNin } from "@/lib/ninClient.js";

export default function VendorVerificationPage() {
  const { user, token } = useAuth(true);
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
    if (nin.length !== 11) {
      toast.error("NIN must be exactly 11 digits");
      return;
    }
    setSubmitting(true);
    try {
      // Encrypted in the browser - the server (and its DB) only ever
      // sees ciphertext, never the raw NIN.
      const encryptedNin = await encryptNin(nin);
      const data = await apiFetch("/api/v1/vendor/verification", { method: "POST", body: JSON.stringify({ nin: encryptedNin }) });
      setStatus(data);
      setNin("");
      if (data.autoVerified) {
        toast.success("NIN verified automatically");
      } else {
        toast.info(data.autoVerificationReason ? `NIN submitted for manual review: ${data.autoVerificationReason}` : "NIN submitted for manual review");
      }
    } catch (err) {
      toast.error(err.message || "Failed to submit NIN");
    } finally {
      setSubmitting(false);
    }
  };

  // Identity verification is the vendor's own, personal to them - staff
  // never see or touch it (the API already only accepts role "vendor"
  // here, this just avoids an infinite skeleton for a fetch that will
  // never succeed for them).
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-800">This page is only available to the store owner.</p>;
  }

  if (loading || !status) return <FormSkeleton fields={3} />;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader
        title="Verification"
        description="You can set up your store and add products right away, but customers cannot order until your identity is verified."
      />

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
        <form onSubmit={handleSubmit} className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium text-slate-700">NIN (National Identification Number)</label>
              <InfoTip>
                Why do we need your NIN? It confirms you&apos;re a real person behind this store - this is for fraud prevention, so buyers can trust who they&apos;re paying and we can catch impersonation or stolen-identity stores before they take orders. It&apos;s never shown publicly.
              </InfoTip>
            </div>
            <Input
              placeholder="12345678901"
              maxLength={11}
              value={nin}
              onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <p className="text-xs text-slate-700">
            Your NIN is encrypted on your device before it&apos;s sent - it&apos;s stored encrypted.
          </p>
          <Button type="submit" loading={submitting} fullWidth>Submit for review</Button>
        </form>
      )}
    </div>
  );
}
