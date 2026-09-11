"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

const KIND_LABEL = {
  blocked_email: "Blocked email",
  banned_device: "Banned device retry",
  signup_flood: "Signup flood",
  rate_burst: "Rate burst",
};

export default function BansPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [data, setData] = useState(null);
  const [manualDevice, setManualDevice] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    apiFetch("/api/v1/super-admin/bans")
      .then(setData)
      .catch((err) => toast.error(err.message || "Couldn't load bans"));
  };
  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const banDevice = async (deviceId, reason) => {
    setBusy(true);
    try {
      await apiFetch("/api/v1/super-admin/bans", { method: "POST", body: JSON.stringify({ deviceId, reason }) });
      toast.success("Device banned");
      setManualDevice("");
      setManualReason("");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't ban");
    } finally {
      setBusy(false);
    }
  };

  const unban = async (id) => {
    try {
      await apiFetch(`/api/v1/super-admin/bans/${id}`, { method: "DELETE" });
      toast.success("Ban lifted");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't lift the ban");
    }
  };

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">Device bans</h1>
        <FormSkeleton fields={4} />
      </div>
    );
  }

  const active = data.devices.filter((d) => !d.unbannedAt);
  const lifted = data.devices.filter((d) => d.unbannedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Device bans</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data.activeCount} active. Devices are auto-flagged for repeated blocked-email attempts, signup floods and
          request bursts (see the privacy policy); you can also ban or lift by hand.
        </p>
      </div>

      {/* Manual ban */}
      <div className="bg-surface border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Ban a device by id</p>
        <p className="text-xs text-slate-500">Paste a device id from the watch-list or abuse stream below.</p>
        <Input label="Device id" value={manualDevice} onChange={(e) => setManualDevice(e.target.value)} />
        <Input label="Reason" value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
        <Button
          onClick={() => banDevice(manualDevice.trim(), manualReason.trim() || "Manual ban")}
          loading={busy}
          disabled={!manualDevice.trim() || !manualReason.trim()}
        >
          Ban device
        </Button>
      </div>

      {/* Watch list */}
      {data.rollup?.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Watch list, abuse events, last 24h</p>
          <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium text-right">Events</th>
                  <th className="px-3 py-2 font-medium">Last</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rollup.map((r) => {
                  const banned = active.some((d) => d.deviceId === r.deviceId);
                  return (
                    <tr key={r.deviceId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs break-all">{r.deviceId}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.n}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.last)}</td>
                      <td className="px-3 py-2 text-right">
                        {banned ? (
                          <Badge color="red">banned</Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => banDevice(r.deviceId, `Manual: ${r.n} abuse events in 24h`)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Ban
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active bans */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Active bans ({active.length})</p>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">None.</p>
        ) : (
          <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Device / fingerprint</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono text-[11px] break-all">
                      {d.deviceId || "N/A"}
                      {d.fingerprint && <div className="text-slate-400">fp {d.fingerprint}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{d.reason || "N/A"}</td>
                    <td className="px-3 py-2 text-slate-500 break-all">{d.subjectEmail || "N/A"}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(d.bannedAt)}</td>
                    <td className="px-3 py-2">
                      <Badge color={d.autoFlagged ? "amber" : "slate"}>{d.autoFlagged ? "auto" : "manual"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => unban(d.id)} className="text-xs text-brand-600 hover:underline">
                        Unban
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent abuse stream */}
      {data.events?.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Recent abuse events</p>
          <div className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {data.events.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-700">{KIND_LABEL[e.kind] || e.kind}</span>
                  {e.normalizedEmail && <span className="text-slate-500"> · {e.normalizedEmail}</span>}
                  <span className="block font-mono text-[11px] text-slate-400 break-all">
                    {e.deviceId} {e.ip ? `· ${e.ip}` : ""}
                  </span>
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{formatDateTime(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lifted.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Lifted bans ({lifted.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-sm">
            {lifted.map((d) => (
              <li key={d.id} className="px-3 py-2 text-xs text-slate-500">
                <span className="font-mono break-all">{d.deviceId || d.fingerprint}</span> · {d.reason} · lifted{" "}
                {formatDateTime(d.unbannedAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
