"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { Badge } from "@/components/ui/Badge.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

export default function SuperAdminCustomersPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [verifyingId, setVerifyingId] = useState(null);
  const [banningId, setBanningId] = useState(null);

  // One fetch path. `loading` starts true and is only ever cleared when a
  // fetch settles; it's switched back on by whichever interaction asks for
  // fresh data (see the handlers below), never synchronously inside this
  // effect. `alive` drops the response of a request whose inputs have
  // already changed, so a slow page-1 reply can't land on top of page 2.
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/customers?${params}`)
      .then((data) => {
        if (!alive) return;
        setCustomers(data.customers);
        setPagination(data.pagination);
      })
      .catch((err) => {
        if (alive) toast.error(err.message || "Failed to load customers");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, token, page, q, refreshKey]);

  // Re-runs the effect above after a mutation, in place of calling the
  // fetch directly from a handler.
  const refresh = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  // A new search resets to the first page - done in the event that causes
  // it rather than in an effect watching `q`.
  const handleSearch = (value) => {
    setLoading(true);
    setPage(1);
    setQ(value);
  };

  const handlePageChange = (next) => {
    setLoading(true);
    setPage(next);
  };

  // For a customer stuck unverified because the email itself never
  // arrived (deliverability issue, not something they did wrong) -
  // see PATCH /api/v1/super-admin/customers/[id].
  const handleVerify = async (customer) => {
    setVerifyingId(customer.id);
    try {
      await apiFetch(`/api/v1/super-admin/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({}) });
      toast.success("Email marked as verified - they can sign in now");
      refresh();
    } catch (err) {
      toast.error(err.message || "Failed to verify customer");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleBan = async (c) => {
    if (c.isBanned) {
      // Unban: find and lift any device ban tied to this email, else just clear the flag.
      setBanningId(c.id);
      try {
        const { devices } = await apiFetch("/api/v1/super-admin/bans");
        const row = (devices || []).find((d) => !d.unbannedAt && d.subjectEmail === c.email);
        if (row) await apiFetch(`/api/v1/super-admin/bans/${row.id}`, { method: "DELETE" });
        else await apiFetch(`/api/v1/super-admin/customers/${c.id}`, { method: "PATCH", body: JSON.stringify({ isBanned: false }) });
        toast.success("Customer unbanned");
        refresh();
      } catch (err) {
        toast.error(err.message || "Couldn't unban");
      } finally {
        setBanningId(null);
      }
      return;
    }
    const reason = window.prompt("Ban this customer. Reason (shown to them on appeal):", "Bulk account creation / abuse");
    if (!reason) return;
    setBanningId(c.id);
    try {
      await apiFetch("/api/v1/super-admin/bans", {
        method: "POST",
        body: JSON.stringify({ customerId: c.id, banSignupDevice: true, reason: reason.trim() }),
      });
      toast.success(c.signupDeviceId ? "Customer + their device banned" : "Customer banned");
      refresh();
    } catch (err) {
      toast.error(err.message || "Couldn't ban");
    } finally {
      setBanningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Customers</h1>

      <SearchInput value={q} onSearch={handleSearch} placeholder="Search by name or email..." className="max-w-sm" />

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Total spent</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Email verified</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={8} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-700">{q ? "No customers match your search" : "No customers yet"}</td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-slate-800">{c.email}</td>
                  <td className="px-4 py-3 text-slate-800">{c.storeName || "-"}</td>
                  <td className="px-4 py-3 text-slate-800">{c.orderCount}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color={c.emailVerified ? "green" : "amber"}>{c.emailVerified ? "Verified" : "Unverified"}</Badge>
                      {c.isBanned && <Badge color="red">Banned</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!c.emailVerified && (
                      <button
                        type="button"
                        disabled={verifyingId === c.id}
                        onClick={() => handleVerify(c)}
                        className="text-green-600 hover:underline disabled:opacity-50 cursor-pointer mr-3"
                      >
                        Verify manually
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={banningId === c.id}
                      onClick={() => handleBan(c)}
                      className={`hover:underline disabled:opacity-50 cursor-pointer ${c.isBanned ? "text-brand-600" : "text-red-600"}`}
                    >
                      {c.isBanned ? "Unban" : "Ban"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}
