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

  function handleSubmit(event) {
    event.preventDefault();
    const normalizedOrderNumber = orderNumber.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^ORD-[A-Z0-9]{6,10}$/.test(normalizedOrderNumber)) {
      setError("Enter the order number from your confirmation email, for example ORD-ABC123.");
      return;
    }
    if (!normalizedEmail) {
      setError("Enter the email address used at checkout.");
      return;
    }

    setError(null);
    router.push(`/orders/${encodeURIComponent(normalizedOrderNumber)}?email=${encodeURIComponent(normalizedEmail)}`);
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Order tracking</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">Find your order</h1>
        <p className="text-sm text-slate-700 mt-2">Use the order number and email address from checkout.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Order number"
          name="orderNumber"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="ORD-ABC123"
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
        <Button type="submit" fullWidth>View order</Button>
      </form>
    </div>
  );
}
