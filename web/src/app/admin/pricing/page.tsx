"use client";

import { useState, useEffect } from "react";

interface ModelRates {
  textInput: number;
  textOutput: number;
  audioInput: number;
  audioOutput: number;
}

interface PricingData {
  models: Record<string, ModelRates>;
  defaultMarginPct: number;
  telecomCostPerMin: number;
  baseCurrency: string;
  exchangeRates: Record<string, number>;
  exchangeRatesUpdatedAt: string | null;
  updatedAt: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "\u20AC", GBP: "\u00A3", CHF: "CHF", JPY: "\u00A5",
  CAD: "C$", AUD: "A$", SEK: "kr", NOK: "kr", DKK: "kr",
};

function fmtRate(n: number): string {
  if (n === 0) return "—";
  return n >= 0.01 ? n.toFixed(4) : n.toExponential(2);
}

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Editable state
  const [models, setModels] = useState<Record<string, ModelRates>>({});
  const [defaultMarginPct, setDefaultMarginPct] = useState(30);
  const [telecomCostPerMin, setTelecomCostPerMin] = useState(0.008);
  const [newModelName, setNewModelName] = useState("");

  useEffect(() => {
    fetch("/api/ai-pricing")
      .then((r) => r.json())
      .then((data: PricingData) => {
        setPricing(data);
        setModels(data.models || {});
        setDefaultMarginPct(data.defaultMarginPct);
        setTelecomCostPerMin(data.telecomCostPerMin);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await fetch("/api/ai-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models,
          defaultMarginPct,
          telecomCostPerMin,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setPricing(data);
        setMessage({ type: "success", text: "Configuration sauvegardee" });
      } else {
        setMessage({ type: "danger", text: "Erreur de sauvegarde" });
      }
    } catch {
      setMessage({ type: "danger", text: "Erreur reseau" });
    }
    setSaving(false);
  };

  const updateRate = (model: string, field: keyof ModelRates, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setModels((prev) => ({
      ...prev,
      [model]: { ...prev[model], [field]: num },
    }));
  };

  const removeModel = (model: string) => {
    setModels((prev) => {
      const copy = { ...prev };
      delete copy[model];
      return copy;
    });
  };

  const addModel = () => {
    const name = newModelName.trim();
    if (!name || models[name]) return;
    setModels((prev) => ({
      ...prev,
      [name]: { textInput: 0, textOutput: 0, audioInput: 0, audioOutput: 0 },
    }));
    setNewModelName("");
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border text-primary"></span>
      </div>
    );
  }

  const baseSym = CURRENCY_SYMBOLS[pricing?.baseCurrency || "USD"] || "$";
  const eurRate = pricing?.exchangeRates?.["EUR"];

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Tarification IA & Telecom</h4>
          <small className="text-muted">
            Configuration globale — devise modeles : {pricing?.baseCurrency || "USD"}
            {pricing?.updatedAt && (
              <> — MAJ : {new Date(pricing.updatedAt).toLocaleString("fr-FR")}</>
            )}
          </small>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <span className="spinner-border spinner-border-sm me-1"></span>
          ) : (
            <i className="bi bi-check-lg me-1"></i>
          )}
          Sauvegarder
        </button>
      </div>

      {message && (
        <div className={`alert alert-${message.type} alert-dismissible`}>
          {message.text}
          <button className="btn-close" onClick={() => setMessage(null)}></button>
        </div>
      )}

      {/* Global settings */}
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-sliders me-2"></i>Parametres globaux
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-medium">
                <i className="bi bi-percent me-1"></i>Marge IA par defaut
              </label>
              <div className="input-group">
                <input
                  type="number"
                  className="form-control"
                  value={defaultMarginPct}
                  onChange={(e) => setDefaultMarginPct(parseFloat(e.target.value) || 0)}
                  step="1"
                  min="0"
                />
                <span className="input-group-text">%</span>
              </div>
              <small className="text-muted">
                Appliquee sur le cout IA. Modifiable par restaurant.
              </small>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-medium">
                <i className="bi bi-telephone me-1"></i>Cout telecom / minute
              </label>
              <div className="input-group">
                <input
                  type="number"
                  className="form-control"
                  value={telecomCostPerMin}
                  onChange={(e) => setTelecomCostPerMin(parseFloat(e.target.value) || 0)}
                  step="0.001"
                  min="0"
                />
                <span className="input-group-text">{baseSym}/min</span>
              </div>
              <small className="text-muted">
                Cout direct sans marge.
              </small>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-medium">
                <i className="bi bi-currency-exchange me-1"></i>Taux de change (BCE)
              </label>
              <div className="input-group">
                <span className="input-group-text">1 {pricing?.baseCurrency || "USD"} =</span>
                <input
                  type="text"
                  className="form-control"
                  value={eurRate ? `${eurRate.toFixed(4)} \u20AC` : "—"}
                  readOnly
                  disabled
                />
              </div>
              <small className="text-muted">
                {pricing?.exchangeRatesUpdatedAt
                  ? `MAJ auto : ${new Date(pricing.exchangeRatesUpdatedAt).toLocaleString("fr-FR")}`
                  : "Pas encore charge"}
                {" — taux BCE, rafraichi toutes les heures"}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Model rates table */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span>
            <i className="bi bi-cpu me-2"></i>Prix par token ({pricing?.baseCurrency || "USD"} / 1M tokens)
          </span>
          {eurRate && (
            <small className="text-muted">
              Conversion auto en {"\u20AC"} pour les restaurants en EUR
            </small>
          )}
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr style={{ fontSize: "0.8rem" }}>
                  <th className="ps-3">Modele</th>
                  <th>Text Input</th>
                  <th>Text Output</th>
                  <th>Audio Input</th>
                  <th>Audio Output</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(models).map(([model, rates]) => (
                  <tr key={model}>
                    <td className="fw-medium ps-3">
                      <i className="bi bi-robot me-2 text-primary"></i>
                      {model}
                    </td>
                    {(["textInput", "textOutput", "audioInput", "audioOutput"] as const).map((field) => (
                      <td key={field}>
                        <div className="input-group input-group-sm" style={{ width: 120 }}>
                          <span className="input-group-text" style={{ fontSize: "0.75rem" }}>{baseSym}</span>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            value={rates[field]}
                            onChange={(e) => updateRate(model, field, e.target.value)}
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </td>
                    ))}
                    <td>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => removeModel(model)}
                        title="Supprimer"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
                {Object.keys(models).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-3">
                      Aucun modele configure
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer">
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Nom du modele (ex: gpt-realtime)"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addModel()}
              style={{ maxWidth: 300 }}
            />
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={addModel}
              disabled={!newModelName.trim()}
            >
              <i className="bi bi-plus-lg me-1"></i>Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* Exchange rates overview */}
      {pricing?.exchangeRates && Object.keys(pricing.exchangeRates).length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <i className="bi bi-currency-exchange me-2"></i>Taux de change disponibles (1 {pricing.baseCurrency || "USD"} =)
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2">
              {Object.entries(pricing.exchangeRates)
                .filter(([code]) => ["EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK"].includes(code))
                .map(([code, rate]) => (
                  <span key={code} className={`badge ${code === "EUR" ? "bg-primary" : "bg-secondary"}`} style={{ fontSize: "0.8rem" }}>
                    {CURRENCY_SYMBOLS[code] || code} {fmtRate(rate)} {code}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
