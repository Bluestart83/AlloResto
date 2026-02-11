"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import { formatPhoneDisplay } from "@/lib/format-phone";

const OUTCOME_LABELS: Record<string, { label: string; bg: string; icon: string }> = {
  in_progress: { label: "En cours", bg: "bg-info", icon: "bi-telephone-fill" },
  order_placed: { label: "Commande", bg: "bg-success", icon: "bi-bag-check" },
  reservation_placed: { label: "Reservation", bg: "bg-primary", icon: "bi-calendar-check" },
  message_left: { label: "Message", bg: "bg-secondary", icon: "bi-envelope" },
  abandoned: { label: "Abandonne", bg: "bg-warning", icon: "bi-x-circle" },
  info_only: { label: "Info", bg: "bg-primary", icon: "bi-info-circle" },
  error: { label: "Erreur", bg: "bg-danger", icon: "bi-exclamation-triangle" },
};

type CallFilter = "all" | "blocked" | "missed";

function formatDuration(sec: number | null) {
  if (!sec) return "\u2014";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20AC", USD: "$", GBP: "\u00A3", CHF: "CHF",
};

function formatCost(cost: number | null | undefined, sym = "\u20AC") {
  if (!cost || cost === 0) return "\u2014";
  if (cost < 0.01) return `<0.01${sym}`;
  return `${cost.toFixed(2)}${sym}`;
}

function formatTokens(n: number | null | undefined) {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function CallsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [blockedPhones, setBlockedPhones] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<CallFilter>("all");
  const billingCurrency = process.env.NEXT_PUBLIC_BILLING_CURRENCY!;
  const [displayCurrency, setDisplayCurrency] = useState(billingCurrency);
  const [displayFx, setDisplayFx] = useState(1);

  const fetchBlockedPhones = useCallback(() => {
    fetch(`/api/blocked-phones?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBlockedPhones(new Set(data.map((b: any) => b.phone)));
        }
      })
      .catch(() => {});
  }, [restaurantId]);

  useEffect(() => {
    fetch(`/api/calls?restaurantId=${restaurantId}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setCalls(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetchBlockedPhones();
    // Fetch restaurant display currency (costs stored in BILLING_CURRENCY)
    fetch(`/api/restaurants?id=${restaurantId}`).then((r) => r.json()).then((resto) => {
      const cur = resto?.currency;
      if (cur) setDisplayCurrency(cur);
      // If restaurant currency differs from billing, fetch display fx
      if (cur && cur !== billingCurrency) {
        fetch("/api/ai-pricing").then((r) => r.json()).then((pricing) => {
          setDisplayFx(pricing?.exchangeRates?.[cur] || 1);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [restaurantId, fetchBlockedPhones]);

  const handleBlockToggle = async (phone: string) => {
    if (!phone) return;
    const isBlocked = blockedPhones.has(phone);

    if (isBlocked) {
      await fetch(
        `/api/blocked-phones?restaurantId=${restaurantId}&phone=${encodeURIComponent(phone)}`,
        { method: "DELETE" }
      );
    } else {
      await fetch("/api/blocked-phones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, phone }),
      });
    }
    fetchBlockedPhones();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return (
      date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) +
      " " +
      date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  // Filtrer les appels
  const filteredCalls = calls.filter((call) => {
    if (filter === "blocked") return blockedPhones.has(call.callerNumber);
    if (filter === "missed") return call.outcome === "abandoned" || call.outcome === "error";
    return true;
  });

  // Totaux coûts (stockés en BILLING_CURRENCY, convertis en devise d'affichage si different)
  const fx = displayFx;
  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const totalCostAi = calls.reduce((s, c) => s + (Number(c.costAi) || 0), 0) * fx;
  const totalCostTelecom = calls.reduce((s, c) => s + (Number(c.costTelecom) || 0), 0) * fx;
  const totalTokens = calls.reduce((s, c) => s + (c.inputTokens || 0) + (c.outputTokens || 0), 0);
  const totalCost = totalCostAi + totalCostTelecom;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Appels</h4>
          <small className="text-muted">
            {filteredCalls.length} appel(s)
            {totalTokens > 0 && (
              <span className="badge bg-dark ms-2">
                {formatTokens(totalTokens)} tokens
              </span>
            )}
            {totalCost > 0 && (
              <>
                <span className="badge bg-info ms-1" title="Cout total (IA + telecom)">
                  {totalCost.toFixed(2)}{sym}
                </span>
                <span className="badge bg-secondary ms-1" title="Dont IA">
                  IA: {totalCostAi.toFixed(2)}{sym}
                </span>
                <span className="badge bg-secondary ms-1" title="Dont telecom">
                  Tel: {totalCostTelecom.toFixed(2)}{sym}
                </span>
              </>
            )}
            {blockedPhones.size > 0 && (
              <span className="badge bg-danger ms-2">
                {blockedPhones.size} numero(s) bloque(s)
              </span>
            )}
          </small>
        </div>
      </div>

      {/* Filtres */}
      <div className="d-flex gap-2 mb-4">
        {([
          { key: "all", label: "Tous", icon: "bi-list" },
          { key: "blocked", label: "Bloques", icon: "bi-slash-circle" },
          { key: "missed", label: "Manques", icon: "bi-x-circle" },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setFilter(key)}
          >
            <i className={`bi ${icon} me-1`}></i>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-telephone fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">
            {filter === "blocked"
              ? "Aucun appel de numeros bloques"
              : filter === "missed"
                ? "Aucun appel manque"
                : "Aucun appel enregistre"}
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr className="text-muted" style={{ fontSize: "0.8rem" }}>
                <th>Date</th>
                <th>Numero</th>
                <th>Client</th>
                <th>Duree</th>
                <th>Cout</th>
                <th>Resultat</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call) => {
                const oc = OUTCOME_LABELS[call.outcome] || {
                  label: call.outcome,
                  bg: "bg-secondary",
                  icon: "bi-question",
                };
                const expanded = expandedId === call.id;
                const isBlocked = blockedPhones.has(call.callerNumber);
                const callCost = ((Number(call.costAi) || 0) + (Number(call.costTelecom) || 0)) * fx;

                return (
                  <Fragment key={call.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpandedId(expanded ? null : call.id)
                      }
                    >
                      <td>
                        <small>{formatDate(call.startedAt)}</small>
                      </td>
                      <td className="fw-medium">
                        {formatPhoneDisplay(call.callerNumber)}
                        {isBlocked && (
                          <span
                            className="badge bg-danger ms-1"
                            style={{ fontSize: "0.65rem" }}
                          >
                            bloque
                          </span>
                        )}
                      </td>
                      <td>
                        {call.customer ? (
                          `${call.customer.firstName || ""} ${call.customer.lastName || ""}`.trim() ||
                          formatPhoneDisplay(call.callerNumber)
                        ) : (
                          <span className="text-muted">{"\u2014"}</span>
                        )}
                      </td>
                      <td>{formatDuration(call.durationSec)}</td>
                      <td>
                        <small>{formatCost(callCost, sym)}</small>
                      </td>
                      <td>
                        <span className={`badge ${oc.bg}`}>
                          <i className={`bi ${oc.icon} me-1`}></i>
                          {oc.label}
                        </span>
                      </td>
                      <td>
                        <i
                          className={`bi bi-chevron-${expanded ? "up" : "down"} text-muted`}
                        ></i>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="bg-dark bg-opacity-25 p-3">
                          {/* Cost & token detail */}
                          {(call.inputTokens > 0 || call.outputTokens > 0) && (() => {
                            const costAi = (Number(call.costAi) || 0) * fx;
                            const costTel = (Number(call.costTelecom) || 0) * fx;
                            return (
                            <div className="mb-3 d-flex gap-4 flex-wrap" style={{ fontSize: "0.8rem" }}>
                              <div>
                                <span className="text-muted">Cout IA : </span>
                                <span>{costAi.toFixed(4)}{sym}</span>
                              </div>
                              {costTel > 0 && (
                              <div>
                                <span className="text-muted">Telecom : </span>
                                <span>{costTel.toFixed(4)}{sym}</span>
                              </div>
                              )}
                              <div>
                                <span className="text-muted">Tokens in : </span>
                                <span>{formatTokens(call.inputTokens)}</span>
                                {call.inputAudioTokens > 0 && (
                                  <span className="text-muted"> (audio: {formatTokens(call.inputAudioTokens)})</span>
                                )}
                              </div>
                              <div>
                                <span className="text-muted">Tokens out : </span>
                                <span>{formatTokens(call.outputTokens)}</span>
                                {call.outputAudioTokens > 0 && (
                                  <span className="text-muted"> (audio: {formatTokens(call.outputAudioTokens)})</span>
                                )}
                              </div>
                              {call.aiModel && (
                                <div>
                                  <span className="text-muted">Modele : </span>
                                  <span>{call.aiModel}</span>
                                </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Block/Unblock button */}
                          {call.callerNumber && (
                            <div className="mb-3">
                              <button
                                className={`btn btn-sm ${isBlocked ? "btn-outline-success" : "btn-outline-danger"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBlockToggle(call.callerNumber);
                                }}
                              >
                                <i
                                  className={`bi ${isBlocked ? "bi-unlock" : "bi-slash-circle"} me-1`}
                                ></i>
                                {isBlocked
                                  ? "Debloquer ce numero"
                                  : "Bloquer ce numero"}
                              </button>
                            </div>
                          )}

                          {call.transcript?.length > 0 ? (
                            <div>
                              <small className="text-muted fw-semibold d-block mb-2">
                                Transcript
                              </small>
                              <div
                                className="d-flex flex-column gap-2"
                                style={{
                                  maxHeight: 300,
                                  overflowY: "auto",
                                }}
                              >
                                {call.transcript.map(
                                  (msg: any, i: number) => (
                                    <div
                                      key={i}
                                      className={`d-flex ${msg.role === "assistant" ? "" : "justify-content-end"}`}
                                    >
                                      <div
                                        className={`rounded-3 px-3 py-2 ${
                                          msg.role === "assistant"
                                            ? "bg-dark bg-opacity-50"
                                            : "bg-primary bg-opacity-25"
                                        }`}
                                        style={{
                                          maxWidth: "80%",
                                          fontSize: "0.85rem",
                                        }}
                                      >
                                        <small
                                          className="text-muted d-block"
                                          style={{ fontSize: "0.7rem" }}
                                        >
                                          {msg.role === "assistant"
                                            ? "IA"
                                            : "Client"}
                                        </small>
                                        {msg.content}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          ) : (
                            <small className="text-muted">
                              Pas de transcript disponible
                            </small>
                          )}
                          {call.errorLog && (
                            <div className="mt-2">
                              <small className="text-danger">
                                {call.errorLog}
                              </small>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
