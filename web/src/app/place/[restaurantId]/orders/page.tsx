"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

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

export default function OrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = () => {
    const url = statusFilter === "all"
      ? `/api/orders?restaurantId=${restaurantId}`
      : `/api/orders?restaurantId=${restaurantId}&status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, [restaurantId, statusFilter]);

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

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
      " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Commandes</h4>
          <small className="text-muted">{orders.length} commande(s)</small>
        </div>
      </div>

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
                  {order.estimatedReadyAt && (
                    <span className="badge bg-light text-dark border" title="Heure estimee">
                      <i className="bi bi-clock me-1"></i>
                      {formatTime(order.estimatedReadyAt)}
                    </span>
                  )}
                  <div className="flex-grow-1">
                    <div className="fw-medium">
                      {order.customerName || order.customerPhone || "Client inconnu"}
                    </div>
                    <small className="text-muted">
                      {order.items?.length || 0} article(s) · {order.orderType === "delivery" ? "Livraison" : "A emporter"}
                    </small>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold">{Number(order.total).toFixed(2)} €</div>
                    <small className="text-muted">{formatDate(order.createdAt)}</small>
                  </div>
                  <i className={`bi bi-chevron-${expanded ? "up" : "down"} text-muted`}></i>
                </div>

                {expanded && (
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
                            <span className="text-muted">{Number(item.totalPrice).toFixed(2)} €</span>
                          </div>
                        ))}
                      </div>
                    )}

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

                    {/* Actions status */}
                    {nextStatuses.length > 0 && (
                      <div className="d-flex gap-2">
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
