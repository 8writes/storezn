"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";

export default function GuestOrderLookupPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedOrderNumber = orderNumber.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^(ORD|INV)-[A-Z0-9-]{6,40}$/.test(normalizedOrderNumber)) {
      setError("Enter the order or invoice number from your email.");
      return;
    }
    if (!normalizedEmail) {
      setError("Enter the email address used at checkout.");
      return;
    }

    setError(null);
    if (normalizedOrderNumber.startsWith("INV-")) {
      setLoading(true);
      try {
        const response = await fetch("/api/v1/storefront/invoices/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceNumber: normalizedOrderNumber, email: normalizedEmail }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Invoice not found");
        window.location.assign(data.paymentUrl);
      } catch (lookupError) {
        setError(lookupError.message || "Invoice not found");
        setLoading(false);
      }
      return;
    }
    router.push(`/orders/${encodeURIComponent(normalizedOrderNumber)}?email=${encodeURIComponent(normalizedEmail)}`);
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Purchase tracking</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">Find an order or invoice</h1>
        <p className="text-sm text-slate-700 mt-2">Use the number and email address from your order or invoice email.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Order or invoice number"
          name="orderNumber"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="ORD-ABC123 or INV-ABC123"
          autoComplete="off"
          required
        />
        <Input
          label="Checkout email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" fullWidth loading={loading}>View purchase</Button>
      </form>
    </div>
  );
}
