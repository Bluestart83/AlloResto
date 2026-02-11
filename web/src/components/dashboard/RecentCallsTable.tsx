"use client";

import type { RecentCall } from "@/types";
import { formatPhoneDisplay } from "@/lib/format-phone";

const outcomeBadge: Record<string, { label: string; cls: string }> = {
  order_placed: { label: "Commandé", cls: "badge-order" },
  abandoned: { label: "Abandonné", cls: "badge-abandoned" },
  info_only: { label: "Info", cls: "badge-info" },
  error: { label: "Erreur", cls: "badge-error" },
};

function fmtDuration(sec: number) {
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}

export default function RecentCallsTable({ calls }: { calls: RecentCall[] }) {
  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-telephone text-muted"></i>
        <h6>Derniers appels</h6>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: "0.85rem" }}>
            <thead className="table-light">
              <tr>
                <th>Heure</th>
                <th>Client</th>
                <th>Durée</th>
                <th>Résultat</th>
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const badge = outcomeBadge[call.outcome] || outcomeBadge.error;
                return (
                  <tr key={call.id}>
                    <td className="font-monospace text-muted">{call.time}</td>
                    <td>
                      <div className="fw-medium">{call.customerName || "Inconnu"}</div>
                      <small className="text-muted">{formatPhoneDisplay(call.callerNumber)}</small>
                    </td>
                    <td className="font-monospace">{fmtDuration(call.duration)}</td>
                    <td>
                      <span className={`badge rounded-pill ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="text-end font-monospace fw-medium">
                      {call.total > 0 ? `${call.total.toFixed(2)}€` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
