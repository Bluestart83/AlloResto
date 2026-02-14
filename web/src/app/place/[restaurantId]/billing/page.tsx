"use client";

import { useParams } from "next/navigation";
import { BillingDashboard } from "@nld/billing-ui";
import type { BillingApi } from "@nld/billing-ui";

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const BILLING_CURRENCY = process.env.NEXT_PUBLIC_BILLING_CURRENCY || "EUR";

function makeBillingApi(restaurantId: string): BillingApi {
  const base = `/api/billing/${restaurantId}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${base}/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Erreur serveur" }));
      throw new Error(err.error || `Erreur ${resp.status}`);
    }
    return resp.json();
  }

  return {
    getBalance: () => request("balance"),
    getTransactions: () => request("transactions"),
    recharge: (amount, currency) =>
      request("recharge", {
        method: "POST",
        body: JSON.stringify({ amount, currency }),
      }),
    setupCard: () =>
      request("setup-card", { method: "POST" }),
    listPaymentMethods: () => request("payment-methods"),
    deletePaymentMethod: (id) =>
      request(`payment-methods/${id}`, { method: "DELETE" }),
    updateAutoRecharge: (config) =>
      request("auto-recharge", {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    adjustment: (amount, description) =>
      request("adjustment", {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
  };
}

export default function BillingPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const api = makeBillingApi(restaurantId);

  if (!STRIPE_PK) {
    return (
      <div className="alert alert-warning">
        <strong>Stripe non configure.</strong> Ajouter{" "}
        <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> dans les variables d'environnement.
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Facturation</h4>
      </div>

      <BillingDashboard
        api={api}
        stripePublishableKey={STRIPE_PK}
        currency={BILLING_CURRENCY}
      />
    </>
  );
}
