"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { Badge } from "@/components/ui/Badge.js";
import { formatDateTime } from "@/lib/format.js";

const shortId = (s) => (s && s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s || "N/A");

export default function SuperAdminDevicesPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [devices, setDevices] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [onlyBanned, setOnlyBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if (onlyBanned) params.set("banned", "1");
    apiFetch(`/api/v1/super-admin/devices?${params}`)
      .then((data) => {
        setDevices(data.devices);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load devices"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, q, onlyBanned]);

  useEffect(() => {
    setPage(1);
  }, [q, onlyBanned]);

  const ban = async (d) => {
    const primary = d.accounts.find((a) => a.email)?.email;
    const reason = window.prompt(
      `Ban this device.\nDevice ${shortId(d.deviceId)}${primary ? `\nSeen as: ${d.accounts.map((a) => a.email).filter(Boolean).join(", ")}` : ""}\n\nReason (shown to them on appeal):`,
      "Bulk account creation / abuse",
    );
    if (reason == null || !reason.trim()) return;
    setBusyId(d.deviceId);
    try {
      await apiFetch("/api/v1/super-admin/bans", {
        method: "POST",
        body: JSON.stringify({ deviceId: d.deviceId, fingerprint: d.fingerprint || undefined, reason: reason.trim() }),
      });
      toast.success("Device banned");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't ban the device");
    } finally {
      setBusyId(null);
    }
  };

  const unban = async (d) => {
    if (!d.banned?.id) return;
    setBusyId(d.deviceId);
    try {
      await apiFetch(`/api/v1/super-admin/bans/${d.banned.id}`, { method: "DELETE" });
      toast.success("Ban lifted");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't lift the ban");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Devices</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Every device that has signed in or signed up, with the accounts seen on it. Recorded at login / signup only.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onSearch={setQ} placeholder="Search email, device id, IP…" className="w-full sm:w-80" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyBanned} onChange={(e) => setOnlyBanned(e.target.checked)} />
          Banned only
        </label>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Accounts seen</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium">Flags</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <TableRowSkeleton rows={8} cols={6} />
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  {q || onlyBanned ? "No devices match." : "No devices recorded yet."}
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.deviceId} className={d.banned ? "bg-red-50/40" : ""}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-mono text-xs text-slate-700" title={d.deviceId}>{shortId(d.deviceId)}</div>
                    {d.fingerprint && <div className="font-mono text-[11px] text-slate-400" title={`fingerprint ${d.fingerprint}`}>fp {d.fingerprint}</div>}
                    <div className="text-[11px] text-slate-400">{d.seenCount}× · first {formatDateTime(d.firstSeenAt)}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {d.accounts.length === 0 ? (
                      <span className="text-slate-400">N/A</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {d.accounts.map((a) => (
                          <li key={`${a.type}:${a.id}`} className="text-slate-700">
                            {a.email || <span className="text-slate-400">(no email)</span>}
                            <span className="text-[11px] text-slate-400"> · {a.type}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">{formatDateTime(d.lastSeenAt)}</td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-slate-500">{d.lastIp || "N/A"}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {d.banned && (
                        <Badge color="red">{d.banned.autoFlagged ? "Auto-banned" : "Banned"}</Badge>
                      )}
                      {d.abuse30d > 0 && <Badge color="amber">{d.abuse30d} abuse ev.</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    {d.banned ? (
                      <button
                        type="button"
                        disabled={busyId === d.deviceId}
                        onClick={() => unban(d)}
                        className="text-brand-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === d.deviceId}
                        onClick={() => ban(d)}
                        className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Ban device
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}
