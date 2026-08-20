"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Badge } from "@/components/ui/Badge.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

const ROLE_COLOR = { admin: "blue", p_staff: "slate" };
const ROLE_LABEL = { admin: "Admin", p_staff: "Platform staff" };

export default function SuperAdminActivityLogPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [logs, setLogs] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/v1/super-admin/activity-log?page=${page}`)
      .then((data) => {
        setLogs(data.logs);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load activity log"));
  }, [token, page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Activity log</h1>
        <p className="text-sm text-slate-500 mt-1">Actions taken by admin and platform staff accounts.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {logs === null ? (
              <TableRowSkeleton cols={4} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No activity logged yet</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{log.actorName}</p>
                    <Badge color={ROLE_COLOR[log.actorRole] || "slate"}>{ROLE_LABEL[log.actorRole] || log.actorRole}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-slate-500">{log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}` : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
