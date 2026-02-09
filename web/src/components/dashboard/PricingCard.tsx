"use client";

import { useState } from "react";
import type { PricingConfig } from "@/types";

interface Props {
  pricing: PricingConfig;
  onPricingChange: (p: PricingConfig) => void;
  totalMinutes: number;
  totalRevenue: number;
}

export default function PricingCard({ pricing, onPricingChange, totalMinutes, totalRevenue }: Props) {
  const [open, setOpen] = useState(false);

  const costToday = (totalMinutes * pricing.perMinute).toFixed(2);
  const aboPerDay = (pricing.monthlyCost / 30).toFixed(2);
  const totalDay = (parseFloat(costToday) + parseFloat(aboPerDay)).toFixed(2);
  const costWeek = (parseFloat(costToday) * 7).toFixed(2);
  const costMonth = (parseFloat(costToday) * 30 + pricing.monthlyCost).toFixed(2);
  const netPerDay = (totalRevenue - parseFloat(totalDay)).toFixed(0);

  return (
    <div className="card border">
      <div className="card-body pricing-toggle p-3" onClick={() => setOpen(!open)}>
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <div className="stat-icon" style={{ backgroundColor: "#1e1e2e" }}>
              <i className="bi bi-currency-euro text-white"></i>
            </div>
            <div>
              <h6 className="mb-0 fw-bold">Tarification & Coûts</h6>
              <small className="text-muted">Coût mensuel estimé : {costMonth}€</small>
            </div>
          </div>
          <i className={`bi ${open ? "bi-chevron-up" : "bi-chevron-down"} text-muted`}></i>
        </div>
      </div>

      {open && (
        <div className="card-body border-top pt-3">
          <div className="row g-4">
            {/* Config */}
            <div className="col-md-4">
              <h6 className="fw-semibold text-muted mb-3" style={{ fontSize: "0.8rem" }}>
                Configuration tarifaire
              </h6>
              <div className="mb-3">
                <label className="form-label" style={{ fontSize: "0.75rem" }}>Abonnement mensuel</label>
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    className="form-control"
                    value={pricing.monthlyCost}
                    onChange={(e) => onPricingChange({ ...pricing, monthlyCost: parseFloat(e.target.value) || 0 })}
                    step="0.10"
                  />
                  <span className="input-group-text">€/mois</span>
                </div>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.75rem" }}>Coût par minute (télécom + IA)</label>
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    className="form-control"
                    value={pricing.perMinute}
                    onChange={(e) => onPricingChange({ ...pricing, perMinute: parseFloat(e.target.value) || 0 })}
                    step="0.01"
                  />
                  <span className="input-group-text">€/min</span>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="col-md-4">
              <h6 className="fw-semibold text-muted mb-3" style={{ fontSize: "0.8rem" }}>
                Décomposition du jour
              </h6>
              <table className="table table-sm mb-0" style={{ fontSize: "0.85rem" }}>
                <tbody>
                  <tr>
                    <td className="text-muted">Minutes consommées</td>
                    <td className="text-end font-monospace fw-medium">{totalMinutes} min</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Coût minutes</td>
                    <td className="text-end font-monospace fw-medium">{costToday}€</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Abonnement / jour</td>
                    <td className="text-end font-monospace fw-medium">{aboPerDay}€</td>
                  </tr>
                  <tr className="border-top">
                    <td className="fw-bold">Total du jour</td>
                    <td className="text-end font-monospace fw-bold text-primary">{totalDay}€</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Projections */}
            <div className="col-md-4">
              <h6 className="fw-semibold text-muted mb-3" style={{ fontSize: "0.8rem" }}>
                Projections
              </h6>
              <table className="table table-sm mb-3" style={{ fontSize: "0.85rem" }}>
                <tbody>
                  <tr>
                    <td className="text-muted">Estimation semaine</td>
                    <td className="text-end font-monospace fw-bold text-warning">{costWeek}€</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Estimation mois</td>
                    <td className="text-end font-monospace fw-bold text-primary">{costMonth}€</td>
                  </tr>
                </tbody>
              </table>
              <div className="alert alert-success py-2 px-3 mb-0" style={{ fontSize: "0.8rem" }}>
                <strong>ROI :</strong> {totalRevenue}€ CA/jour → {netPerDay}€ net/jour vs commission Uber Eats
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
