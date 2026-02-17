import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { BillingApi, PaymentMethodEntry } from "../types";

// ---------------------------------------------------------------------------
// Stripe singleton cache (keyed by publishable key)
// ---------------------------------------------------------------------------

const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(pk: string) {
  let p = stripeCache.get(pk);
  if (!p) {
    p = loadStripe(pk);
    stripeCache.set(pk, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// PaymentForm (inside Elements provider)
// ---------------------------------------------------------------------------

function PaymentForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError("");

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "Erreur de paiement");
      setProcessing(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div className="alert alert-danger mt-3">{error}</div>}
      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary" disabled={!stripe || processing}>
          {processing ? <span className="spinner-border spinner-border-sm me-1" /> : null}
          Payer
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={processing}>
          Annuler
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// SetupCardForm (inside Elements provider)
// ---------------------------------------------------------------------------

function SetupCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError("");

    const { error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "Erreur");
      setProcessing(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div className="alert alert-danger mt-3">{error}</div>}
      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary" disabled={!stripe || processing}>
          {processing ? <span className="spinner-border spinner-border-sm me-1" /> : null}
          Enregistrer la carte
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={processing}>
          Annuler
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// RechargePanel
// ---------------------------------------------------------------------------

const AMOUNTS = [10, 25, 50, 100];

interface Props {
  api: BillingApi;
  stripePublishableKey: string;
  currency: string;
  onBalanceChange?: () => void;
}

export function RechargePanel({ api, stripePublishableKey, currency, onBalanceChange }: Props) {
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Payment flow
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [recharging, setRecharging] = useState(false);

  // Setup card flow
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [settingUpCard, setSettingUpCard] = useState(false);

  const [error, setError] = useState("");

  const refreshPaymentMethods = useCallback(async (opts?: { waitForNew?: boolean }) => {
    const currentCount = paymentMethods.length;

    const fetchOnce = async () => {
      const pms = await api.listPaymentMethods();
      setPaymentMethods(pms);
      return pms;
    };

    try {
      if (!opts?.waitForNew) {
        await fetchOnce();
        return;
      }
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const pms = await fetchOnce();
        if (pms.length > currentCount) return;
      }
    } catch {
      setPaymentMethods([]);
    }
  }, [api, paymentMethods.length]);

  // Load payment methods on first render
  if (!loaded) {
    setLoaded(true);
    api.listPaymentMethods().then(setPaymentMethods).catch(() => {});
  }

  const finalAmount = customAmount ? parseFloat(customAmount) : amount;

  async function startRecharge() {
    if (finalAmount <= 0) return;
    setRecharging(true);
    setError("");
    try {
      const result = await api.recharge(finalAmount, currency);
      setPaymentClientSecret(result.clientSecret);
    } catch (err: any) {
      setError(err.message);
      setRecharging(false);
    }
  }

  async function startSetupCard() {
    setSettingUpCard(true);
    setError("");
    try {
      const result = await api.setupCard();
      setSetupClientSecret(result.clientSecret);
    } catch (err: any) {
      setError(err.message);
      setSettingUpCard(false);
    }
  }

  async function deletePM(pmId: string) {
    if (!confirm("Supprimer cette carte ?")) return;
    await api.deletePaymentMethod(pmId);
    setPaymentMethods(paymentMethods.filter((p) => p.id !== pmId));
  }

  const stripePromise = getStripe(stripePublishableKey);

  return (
    <div className="row g-4">
      <div className="col-lg-6">
        <div className="card">
          <div className="card-body">
            <h6 className="card-title">Recharge</h6>

            {error && <div className="alert alert-danger py-2">{error}</div>}

            {paymentClientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret: paymentClientSecret, locale: "fr" }}>
                <p className="mb-3">
                  Montant : <strong>{finalAmount} {currency}</strong>
                </p>
                <PaymentForm
                  onSuccess={async () => {
                    setPaymentClientSecret(null);
                    setRecharging(false);
                    onBalanceChange?.();
                  }}
                  onCancel={() => {
                    setPaymentClientSecret(null);
                    setRecharging(false);
                  }}
                />
              </Elements>
            ) : (
              <>
                <div className="d-flex gap-2 mb-3">
                  {AMOUNTS.map((a) => (
                    <button
                      key={a}
                      className={`btn ${amount === a && !customAmount ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => { setAmount(a); setCustomAmount(""); }}
                    >
                      {a} {currency}
                    </button>
                  ))}
                </div>
                <div className="input-group mb-3" style={{ maxWidth: 200 }}>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Montant libre"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                  <span className="input-group-text">{currency}</span>
                </div>
                <button className="btn btn-primary" onClick={startRecharge} disabled={recharging || finalAmount <= 0}>
                  {recharging ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                  Recharger {finalAmount > 0 ? `${finalAmount} ${currency}` : ""}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="col-lg-6">
        <div className="card">
          <div className="card-body">
            <h6 className="card-title">Cartes enregistrees</h6>

            {setupClientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret, locale: "fr" }}>
                <SetupCardForm
                  onSuccess={async () => {
                    setSetupClientSecret(null);
                    setSettingUpCard(false);
                    await refreshPaymentMethods({ waitForNew: true });
                  }}
                  onCancel={() => {
                    setSetupClientSecret(null);
                    setSettingUpCard(false);
                  }}
                />
              </Elements>
            ) : (
              <>
                {paymentMethods.map((pm) => (
                  <div key={pm.id} className="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <i className="bi bi-credit-card me-2" />
                      <span className="text-capitalize">{pm.brand}</span> **** {pm.last4}
                      {pm.isDefault && <span className="badge bg-primary ms-2">Defaut</span>}
                    </div>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => deletePM(pm.id)}>
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                ))}
                {paymentMethods.length === 0 && (
                  <p className="text-muted mb-3">Aucune carte enregistree</p>
                )}
                <button className="btn btn-outline-primary" onClick={startSetupCard} disabled={settingUpCard}>
                  {settingUpCard ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-plus-lg me-1" />}
                  Ajouter une carte
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
