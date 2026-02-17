import { useState } from "react";
import type { BillingApi } from "../types";

interface Props {
  api: BillingApi;
  currency: string;
  initial: {
    enabled: boolean;
    threshold: number;
    amount: number;
  };
  onUpdate?: () => void;
}

export function AutoRechargeForm({ api, currency, initial, onUpdate }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [amount, setAmount] = useState(initial.amount);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateAutoRecharge({ enabled, threshold, amount });
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h6 className="card-title">Auto-recharge</h6>
        <div className="form-check form-switch mb-3">
          <input className="form-check-input" type="checkbox" checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)} />
          <label className="form-check-label">Activee</label>
        </div>
        {enabled && (
          <div className="row g-2 mb-3">
            <div className="col-6">
              <label className="form-label">Seuil ({currency})</label>
              <input type="number" className="form-control form-control-sm" value={threshold}
                onChange={(e) => setThreshold(+e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label">Montant ({currency})</label>
              <input type="number" className="form-control form-control-sm" value={amount}
                onChange={(e) => setAmount(+e.target.value)} />
            </div>
          </div>
        )}
        <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
