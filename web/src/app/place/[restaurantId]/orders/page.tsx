"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatPhoneDisplay, isValidE164 } from "@/lib/format-phone";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20AC", USD: "$", GBP: "\u00A3", CHF: "CHF",
};

const STATUS_LABELS: Record<string, { label: string; bg: string }> = {
  pending: { label: "En attente", bg: "bg-warning" },
  confirmed: { label: "Confirmée", bg: "bg-primary" },
  preparing: { label: "En prépa", bg: "bg-info" },
  ready: { label: "Prête", bg: "bg-success" },
  delivering: { label: "En livraison", bg: "bg-primary" },
  completed: { label: "Terminée", bg: "bg-success" },
  cancelled: { label: "Annulée", bg: "bg-danger" },
};

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivering", "completed"],
  delivering: ["completed"],
};

const ScooterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/>
    <path d="M7.5 18h9M5 15l3-8h4l2 4h4.5" />
    <path d="M12 7h2l3 8" />
  </svg>
);

const TakeawayBagIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8h14l-1.5 13H6.5L5 8z" />
    <path d="M8 8V6a4 4 0 0 1 8 0v2" />
  </svg>
);

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    [0, 0.2].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.15);
    });
  } catch {
    // AudioContext not available
  }
}

export default function OrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTranscriptId, setShowTranscriptId] = useState<string | null>(null);
  const [activeCalls, setActiveCalls] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [addItemSearch, setAddItemSearch] = useState("");
  const billingCurrency = process.env.NEXT_PUBLIC_BILLING_CURRENCY!;
  const [displayCurrency, setDisplayCurrency] = useState(billingCurrency);
  const [displayFx, setDisplayFx] = useState(1);

  const knownIdsRef = useRef<Set<string> | null>(null);

  const fetchOrders = useCallback(() => {
    const url = statusFilter === "all"
      ? `/api/orders?restaurantId=${restaurantId}`
      : `/api/orders?restaurantId=${restaurantId}&status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const newIds = new Set(list.map((o: any) => o.id as string));

        if (knownIdsRef.current === null) {
          // First load — seed known IDs, no sound
          knownIdsRef.current = newIds;
        } else {
          const hasNew = [...newIds].some((id) => !knownIdsRef.current!.has(id));
          if (hasNew) playNotificationSound();
          knownIdsRef.current = newIds;
        }

        setOrders(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [restaurantId, statusFilter]);

  // Poll orders every 10s
  useEffect(() => {
    knownIdsRef.current = null; // reset on filter/restaurant change
    fetchOrders();
    const interval = setInterval(fetchOrders, 10_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Fetch restaurant display currency (costs stored in BILLING_CURRENCY)
  useEffect(() => {
    fetch(`/api/restaurants?id=${restaurantId}`).then((r) => r.json()).then((resto) => {
      const cur = resto?.currency;
      if (cur) setDisplayCurrency(cur);
      if (cur && cur !== billingCurrency) {
        fetch("/api/ai-pricing").then((r) => r.json()).then((pricing) => {
          setDisplayFx(pricing?.exchangeRates?.[cur] || 1);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [restaurantId, billingCurrency]);

  // Poll active calls every 30s
  useEffect(() => {
    const fetchCalls = () => {
      fetch("/api/admin/servers")
        .then((r) => r.json())
        .then((data) => {
          if (data.managerOnline && Array.isArray(data.agents)) {
            const agent = data.agents.find((a: any) => a.restaurantId === restaurantId);
            setActiveCalls(agent ? agent.activeCalls : 0);
          } else {
            setActiveCalls(null);
          }
        })
        .catch(() => setActiveCalls(null));
    };
    fetchCalls();
    const interval = setInterval(fetchCalls, 30_000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: newStatus }),
    });
    fetchOrders();
  };

  const handleAddTime = async (orderId: string, currentEstimate: string | null, minutesToAdd: number) => {
    const base = currentEstimate ? new Date(currentEstimate) : new Date();
    base.setMinutes(base.getMinutes() + minutesToAdd);
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, estimatedReadyAt: base.toISOString() }),
    });
    fetchOrders();
  };

  const startEditing = (order: any) => {
    setEditingId(order.id);
    setAddItemSearch("");
    setEditForm({
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      orderType: order.orderType || "pickup",
      deliveryAddress: order.deliveryAddress || "",
      notes: order.notes || "",
      items: (order.items || []).map((it: any) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        menuItemId: it.menuItemId,
        _delete: false,
      })),
    });
    // Charger le menu pour l'ajout d'articles
    if (menuItems.length === 0) {
      fetch(`/api/menu?restaurantId=${restaurantId}`)
        .then((r) => r.json())
        .then((data) => {
          const catMap = new Map((data.categories || []).map((c: any) => [c.id, c.name]));
          const items = (data.items || []).map((it: any) => ({
            ...it,
            categoryName: catMap.get(it.categoryId) || "",
          }));
          setMenuItems(items);
        })
        .catch(() => {});
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleEditSave = async (orderId: string) => {
    if (!editForm) return;
    setSaving(true);
    const payload: any = {
      id: orderId,
      customerName: editForm.customerName,
      customerPhone: editForm.customerPhone,
      orderType: editForm.orderType,
      deliveryAddress: editForm.deliveryAddress || null,
      notes: editForm.notes || null,
      items: editForm.items.map((it: any) => ({
        ...(it.id ? { id: it.id } : {}),
        menuItemId: it.menuItemId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        _delete: it._delete,
      })),
    };
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    cancelEditing();
    fetchOrders();
  };

  const editTotal = editForm
    ? editForm.items
        .filter((it: any) => !it._delete)
        .reduce((s: number, it: any) => s + it.unitPrice * it.quantity, 0)
    : 0;

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
      " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  // Compute 5-minute buckets for the last 2 hours
  const chartData = useMemo(() => {
    const now = new Date();
    const bucketCount = 24; // 24 * 5min = 2h
    const labels: string[] = [];
    const counts: number[] = [];

    for (let i = bucketCount - 1; i >= 0; i--) {
      const bucketStart = new Date(now.getTime() - i * 5 * 60_000);
      bucketStart.setSeconds(0, 0);
      bucketStart.setMinutes(bucketStart.getMinutes() - (bucketStart.getMinutes() % 5));
      const bucketEnd = new Date(bucketStart.getTime() + 5 * 60_000);

      labels.push(bucketStart.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      const count = orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= bucketStart.getTime() && t < bucketEnd.getTime();
      }).length;
      counts.push(count);
    }

    return { labels, counts };
  }, [orders]);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Commandes</h4>
          <small className="text-muted">{orders.length} commande(s)</small>
        </div>
        {activeCalls !== null && activeCalls > 0 && (
          <span className="badge bg-info d-flex align-items-center gap-1 fs-6 py-2 px-3">
            <i className="bi bi-telephone-fill"></i>
            {activeCalls} en ligne
          </span>
        )}
      </div>

      {/* Graph commandes / 5 min */}
      {!loading && orders.length > 0 && (
        <div className="card mb-4">
          <div className="card-body py-3">
            <div className="d-flex align-items-center gap-2 mb-2">
              <i className="bi bi-bar-chart text-muted"></i>
              <small className="fw-semibold text-muted">Nouvelles commandes (par 5 min)</small>
            </div>
            <div style={{ height: 120 }}>
              <Bar
                data={{
                  labels: chartData.labels,
                  datasets: [{
                    data: chartData.counts,
                    backgroundColor: chartData.counts.map((c) => c > 0 ? "#818cf8" : "#e2e8f0"),
                    borderRadius: 3,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { tooltip: { enabled: true }, legend: { display: false } },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
                    },
                    y: {
                      grid: { color: "#f1f5f9" },
                      ticks: { font: { size: 10 }, stepSize: 1, precision: 0 },
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filtres status */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        {[{ key: "all", label: "Toutes" }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v.label }))].map(
          ({ key, label }) => (
            <button
              key={key}
              className={`btn btn-sm ${statusFilter === key ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-bag fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune commande</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {orders.map((order) => {
            const st = STATUS_LABELS[order.status] || { label: order.status, bg: "bg-secondary" };
            const nextStatuses = STATUS_FLOW[order.status] || [];
            const expanded = expandedId === order.id;

            return (
              <div key={order.id} className="card border">
                <div
                  className="card-body py-3 d-flex align-items-center gap-3"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedId(expanded ? null : order.id)}
                >
                  <span className={`badge ${st.bg}`} style={{ minWidth: 90 }}>{st.label}</span>
                  {order.source === "phone_ai" ? (
                    <span className="badge d-flex align-items-center gap-1" style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid #10b981" }}>
                      <i className="bi bi-robot"></i> IA
                    </span>
                  ) : order.source === "manual" ? (
                    <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary d-flex align-items-center gap-1">
                      <i className="bi bi-person"></i> Manuel
                    </span>
                  ) : order.source ? (
                    <span className="badge bg-dark bg-opacity-10 text-dark border d-flex align-items-center gap-1">
                      <i className="bi bi-arrow-repeat"></i> {order.source}
                    </span>
                  ) : null}
                  {order.orderType === "delivery" ? (
                    <span className="badge bg-info bg-opacity-10 text-info border border-info d-flex align-items-center gap-1">
                      <ScooterIcon /> Livraison
                    </span>
                  ) : (
                    <span className="badge d-flex align-items-center gap-1" style={{ backgroundColor: "rgba(129,140,248,0.1)", color: "#818cf8", border: "1px solid #818cf8" }}>
                      <TakeawayBagIcon /> A emporter
                    </span>
                  )}
                  {order.estimatedReadyAt && (
                    <span className="badge bg-light text-dark border" title="Heure estimee">
                      <i className="bi bi-clock me-1"></i>
                      {formatTime(order.estimatedReadyAt)}
                    </span>
                  )}
                  <div className="flex-grow-1">
                    <div className="fw-medium">
                      {order.customerName || formatPhoneDisplay(order.customerPhone) || "Client inconnu"}
                    </div>
                    <small className="text-muted">
                      {order.items?.length || 0} article(s)
                    </small>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold">{Number(order.total).toFixed(2)} {CURRENCY_SYMBOLS[displayCurrency] || displayCurrency}</div>
                    <small className="text-muted">{formatDate(order.createdAt)}</small>
                  </div>
                  <i className={`bi bi-chevron-${expanded ? "up" : "down"} text-muted`}></i>
                </div>

                {expanded && editingId === order.id && editForm ? (
                  <div className="card-body border-top pt-3" onClick={(e) => e.stopPropagation()}>
                    {/* Client */}
                    <div className="row g-2 mb-3">
                      <div className="col-md-6">
                        <label className="form-label small text-muted mb-1">Nom client</label>
                        <input className="form-control form-control-sm" value={editForm.customerName}
                          onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small text-muted mb-1">Telephone</label>
                        <input className={`form-control form-control-sm ${editForm.customerPhone && !isValidE164(editForm.customerPhone) ? "is-invalid" : ""}`}
                          value={formatPhoneDisplay(editForm.customerPhone)}
                          onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value.replace(/[\s.\-()]/g, "") })} />
                        {editForm.customerPhone && !isValidE164(editForm.customerPhone) && <div className="invalid-feedback">Format +XX requis</div>}
                      </div>
                    </div>

                    {/* Type + adresse */}
                    <div className="row g-2 mb-3">
                      <div className="col-md-4">
                        <label className="form-label small text-muted mb-1">Type</label>
                        <select className="form-select form-select-sm" value={editForm.orderType}
                          onChange={(e) => setEditForm({ ...editForm, orderType: e.target.value })}>
                          <option value="pickup">A emporter</option>
                          <option value="delivery">Livraison</option>
                          <option value="dine_in">Sur place</option>
                        </select>
                      </div>
                      {editForm.orderType === "delivery" && (
                        <div className="col-md-8">
                          <label className="form-label small text-muted mb-1">Adresse de livraison</label>
                          <input className="form-control form-control-sm" value={editForm.deliveryAddress}
                            onChange={(e) => setEditForm({ ...editForm, deliveryAddress: e.target.value })} />
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="mb-3">
                      <label className="form-label small text-muted mb-1">Notes</label>
                      <textarea className="form-control form-control-sm" rows={2} value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                    </div>

                    {/* Articles */}
                    <div className="mb-3">
                      <small className="text-muted fw-semibold d-block mb-2">Articles</small>
                      {editForm.items.map((item: any, i: number) => (
                        <div key={item.id || `new-${i}`} className={`d-flex align-items-center gap-2 py-1 ${item._delete ? "opacity-50 text-decoration-line-through" : ""}`}>
                          <input type="number" className="form-control form-control-sm" style={{ width: 60 }}
                            min={1} value={item.quantity} disabled={item._delete}
                            onChange={(e) => {
                              const items = [...editForm.items];
                              items[i] = { ...items[i], quantity: Math.max(1, parseInt(e.target.value) || 1) };
                              setEditForm({ ...editForm, items });
                            }} />
                          <span className="flex-grow-1">{item.name}</span>
                          <span className="text-muted" style={{ minWidth: 70, textAlign: "right" }}>
                            {(item.unitPrice * (item._delete ? 0 : item.quantity)).toFixed(2)} €
                          </span>
                          <button className={`btn btn-sm ${item._delete ? "btn-outline-success" : "btn-outline-danger"}`}
                            onClick={() => {
                              const items = [...editForm.items];
                              items[i] = { ...items[i], _delete: !items[i]._delete };
                              setEditForm({ ...editForm, items });
                            }}>
                            <i className={`bi ${item._delete ? "bi-arrow-counterclockwise" : "bi-trash"}`}></i>
                          </button>
                        </div>
                      ))}

                      {/* Ajouter un article */}
                      <div className="mt-2 position-relative">
                        <div className="input-group input-group-sm">
                          <span className="input-group-text"><i className="bi bi-plus-lg"></i></span>
                          <input className="form-control" placeholder="Ajouter un article..."
                            value={addItemSearch}
                            onChange={(e) => setAddItemSearch(e.target.value)} />
                        </div>
                        {addItemSearch.length >= 2 && (
                          <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 10, maxHeight: 200, overflowY: "auto" }}>
                            {menuItems
                              .filter((mi) => mi.isAvailable && mi.name.toLowerCase().includes(addItemSearch.toLowerCase()))
                              .slice(0, 8)
                              .map((mi: any) => (
                                <button key={mi.id} type="button"
                                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 px-2"
                                  onClick={() => {
                                    setEditForm({
                                      ...editForm,
                                      items: [...editForm.items, {
                                        id: null,
                                        menuItemId: mi.id,
                                        name: mi.name,
                                        quantity: 1,
                                        unitPrice: Number(mi.price),
                                        totalPrice: Number(mi.price),
                                        _delete: false,
                                      }],
                                    });
                                    setAddItemSearch("");
                                  }}>
                                  <span>
                                    <small className="text-muted me-1">{mi.categoryName}</small>
                                    {mi.name}
                                  </span>
                                  <span className="text-muted">{Number(mi.price).toFixed(2)} €</span>
                                </button>
                              ))}
                            {menuItems.filter((mi) => mi.isAvailable && mi.name.toLowerCase().includes(addItemSearch.toLowerCase())).length === 0 && (
                              <div className="list-group-item text-muted py-1 px-2 small">Aucun article trouvé</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="d-flex justify-content-end mt-2">
                        <span className="fw-bold">Total : {editTotal.toFixed(2)} €</span>
                      </div>
                    </div>

                    {/* Save / Cancel */}
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-primary" disabled={saving}
                        onClick={() => handleEditSave(order.id)}>
                        {saving ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-lg me-1"></i>}
                        Enregistrer
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={cancelEditing}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : expanded && (
                  <div className="card-body border-top pt-3">
                    {/* Items */}
                    {order.items?.length > 0 && (
                      <div className="mb-3">
                        <small className="text-muted fw-semibold d-block mb-2">Articles</small>
                        {order.items.map((item: any, i: number) => (
                          <div key={i} className="d-flex justify-content-between py-1">
                            <span>
                              <span className="fw-medium">{item.quantity}x</span> {item.name}
                            </span>
                            <span className="text-muted">{Number(item.totalPrice).toFixed(2)} {CURRENCY_SYMBOLS[displayCurrency] || displayCurrency}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Coût service IA */}
                    {order.call && (Number(order.call.costAi) > 0 || Number(order.call.costTelecom) > 0) && (() => {
                      const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
                      const costAi = (Number(order.call.costAi) || 0) * displayFx;
                      const costTel = (Number(order.call.costTelecom) || 0) * displayFx;
                      const costTotal = costAi + costTel;
                      return (
                        <div className="mb-3 d-flex align-items-center gap-2">
                          <small className="text-muted fw-semibold">Cout service IA :</small>
                          <span className="badge bg-dark bg-opacity-10 text-dark border">
                            {costTotal.toFixed(4)} {sym}
                          </span>
                          <small className="text-muted">
                            (IA: {costAi.toFixed(4)}{sym}{costTel > 0 ? ` + tel: ${costTel.toFixed(4)}${sym}` : ""})
                          </small>
                        </div>
                      );
                    })()}

                    {/* Info */}
                    <div className="row g-2 mb-3">
                      {order.deliveryAddress && (
                        <div className="col-md-6">
                          <small className="text-muted d-block">Adresse</small>
                          <small>{order.deliveryAddress}</small>
                        </div>
                      )}
                      {order.notes && (
                        <div className="col-md-6">
                          <small className="text-muted d-block">Notes</small>
                          <small>{order.notes}</small>
                        </div>
                      )}
                    </div>

                    {/* Heure estimee + ajustement */}
                    {!["completed", "cancelled"].includes(order.status) && (
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <small className="text-muted fw-semibold">
                          {order.estimatedReadyAt
                            ? `Pret pour ${formatTime(order.estimatedReadyAt)}`
                            : "Pas d'heure estimee"}
                        </small>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => { e.stopPropagation(); handleAddTime(order.id, order.estimatedReadyAt, 5); }}
                        >
                          +5 min
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => { e.stopPropagation(); handleAddTime(order.id, order.estimatedReadyAt, 10); }}
                        >
                          +10 min
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => { e.stopPropagation(); handleAddTime(order.id, order.estimatedReadyAt, -5); }}
                        >
                          -5 min
                        </button>
                      </div>
                    )}

                    {/* Actions status + edit */}
                    <div className="d-flex gap-2 flex-wrap">
                      {nextStatuses.map((ns) => {
                        const nst = STATUS_LABELS[ns];
                        const isDanger = ns === "cancelled";
                        return (
                          <button
                            key={ns}
                            className={`btn btn-sm ${isDanger ? "btn-outline-danger" : "btn-primary"}`}
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, ns); }}
                          >
                            {isDanger ? <i className="bi bi-x-lg me-1"></i> : <i className="bi bi-arrow-right me-1"></i>}
                            {nst?.label || ns}
                          </button>
                        );
                      })}
                      {!["completed", "cancelled"].includes(order.status) && (
                        <button className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => { e.stopPropagation(); startEditing(order); }}>
                          <i className="bi bi-pencil me-1"></i>Modifier
                        </button>
                      )}
                    </div>

                    {/* Conversation de l'appel */}
                    {order.call?.transcript?.length > 0 && (
                      <div className="mt-3 pt-3 border-top">
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTranscriptId(showTranscriptId === order.id ? null : order.id);
                          }}
                        >
                          <i className={`bi bi-chat-dots me-1`}></i>
                          Conversation
                          <i className={`bi bi-chevron-${showTranscriptId === order.id ? "up" : "down"} ms-1`}></i>
                        </button>
                        {showTranscriptId === order.id && (
                          <div className="d-flex flex-column gap-2 mt-2" style={{ maxHeight: 300, overflowY: "auto" }}>
                            {order.call.transcript.map((msg: any, i: number) => (
                              <div key={i} className={`d-flex ${msg.role === "assistant" ? "" : "justify-content-end"}`}>
                                <div
                                  className={`rounded-3 px-3 py-2 ${msg.role === "assistant" ? "bg-dark bg-opacity-10" : "bg-primary bg-opacity-10"}`}
                                  style={{ maxWidth: "80%", fontSize: "0.85rem" }}
                                >
                                  <small className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                                    {msg.role === "assistant" ? "IA" : "Client"}
                                  </small>
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
