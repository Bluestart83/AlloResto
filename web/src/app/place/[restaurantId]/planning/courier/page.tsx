"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import type { TimelineOrderInfo } from "@/types/planning";

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMin(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

export default function CourierPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [orders, setOrders] = useState<TimelineOrderInfo[]>([]);
  const [delivering, setDelivering] = useState<TimelineOrderInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/planning/timeline?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.orders) {
          const deliveryReady = data.orders.filter(
            (o: TimelineOrderInfo) => o.status === "ready" && o.orderType === "delivery"
          );
          const inDelivery = data.orders.filter(
            (o: TimelineOrderInfo) => o.status === "delivering"
          );
          setOrders(deliveryReady);
          setDelivering(inDelivery);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [restaurantId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  };

  const handleConfirmPickup = async () => {
    setConfirming(true);
    for (const orderId of selected) {
      await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: "delivering" }),
      });
    }
    setSelected(new Set());
    setShowConfirmDialog(false);
    setConfirming(false);
    fetchData();
  };

  const handleDelivered = async (orderId: string) => {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: "completed" }),
    });
    fetchData();
  };

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const oldestSelected = selectedOrders.length > 0
    ? selectedOrders.reduce((oldest, o) =>
        new Date(o.createdAt) < new Date(oldest.createdAt) ? o : oldest
      )
    : null;

  if (loading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border text-primary"></span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-bicycle me-2"></i>Livreur
          </h4>
          <small className="text-muted">
            {orders.length} commande(s) prête(s)
          </small>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      {/* Ready orders */}
      {orders.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-check-circle fs-1 text-success d-block mb-2"></i>
          <p className="text-muted">Aucune commande prête à prendre</p>
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="d-flex justify-content-between align-items-center mb-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={selectAll}>
              {selected.size === orders.length ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
            {selected.size > 0 && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setShowConfirmDialog(true)}
              >
                <i className="bi bi-check2-all me-1"></i>
                Prendre {selected.size} commande(s)
              </button>
            )}
          </div>

          <div className="d-flex flex-column gap-2 mb-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className={`card border ${selected.has(order.id) ? "border-primary" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => toggleSelect(order.id)}
              >
                <div className="card-body py-3 px-3 d-flex align-items-center gap-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <div className="fw-medium">
                      {order.customerName || order.customerPhone}
                    </div>
                    <small className="text-muted">
                      {order.itemCount} article(s) · {Number(order.total).toFixed(2)} €
                    </small>
                    {order.deliveryAddress && (
                      <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                        <i className="bi bi-geo-alt me-1"></i>{order.deliveryAddress}
                      </div>
                    )}
                  </div>
                  <div className="text-end">
                    <div className="fw-bold">{formatTime(order.estimatedReadyAt)}</div>
                    <small className="text-muted">
                      {formatTime(order.handoffAt)}
                    </small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* In delivery */}
      {delivering.length > 0 && (
        <div>
          <h6 className="fw-bold mb-2">
            <i className="bi bi-geo-alt me-2"></i>En livraison ({delivering.length})
          </h6>
          <div className="d-flex flex-column gap-2">
            {delivering.map((order) => (
              <div key={order.id} className="card border">
                <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                  <span className="flex-grow-1">
                    {order.customerName || order.customerPhone}
                  </span>
                  <small className="text-muted">
                    <i className="bi bi-clock me-1"></i>
                    {formatTime(order.estimatedReadyAt)}
                  </small>
                  <button
                    className="btn btn-sm btn-outline-success"
                    onClick={() => handleDelivered(order.id)}
                  >
                    <i className="bi bi-check2-all me-1"></i>Livré
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirmDialog && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowConfirmDialog(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Confirmer la prise</h6>
                <button className="btn-close" onClick={() => setShowConfirmDialog(false)}></button>
              </div>
              <div className="modal-body">
                <p>
                  <strong>{selected.size}</strong> commande(s) sélectionnée(s)
                </p>
                {oldestSelected && (
                  <small className="text-muted">
                    Plus ancienne : {formatTime(oldestSelected.createdAt)}
                    {" "}({elapsedMin(oldestSelected.createdAt)} min)
                  </small>
                )}
                <div className="mt-2">
                  {selectedOrders.map((o) => (
                    <div key={o.id} className="d-flex justify-content-between py-1 border-bottom">
                      <span>{o.customerName || o.customerPhone}</span>
                      <small className="text-muted text-truncate ms-2" style={{ maxWidth: 200 }}>
                        {o.deliveryAddress}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmPickup}
                  disabled={confirming}
                >
                  {confirming ? (
                    <span className="spinner-border spinner-border-sm me-1"></span>
                  ) : (
                    <i className="bi bi-check2-all me-1"></i>
                  )}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
