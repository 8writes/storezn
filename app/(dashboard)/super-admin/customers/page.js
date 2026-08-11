"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

export default function SuperAdminCustomersPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/customers?${params}`)
      .then((data) => {
        setCustomers(data.customers);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load customers"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Customers</h1>

      <SearchInput value={q} onSearch={setQ} placeholder="Search by name or email..." className="max-w-sm" />

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Total spent</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={6} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{q ? "No customers match your search" : "No customers yet"}</td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-slate-500">{c.email}</td>
                  <td className="px-4 py-3 text-slate-500">{c.storeName || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.orderCount}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(c.createdAt)}</td>
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
