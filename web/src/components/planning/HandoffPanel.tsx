"use client";

import type { TimelineOrderInfo } from "@/types/planning";
import { formatPhoneDisplay } from "@/lib/format-phone";

interface HandoffPanelProps {
  orders: TimelineOrderInfo[];
  onStatusChange: (orderId: string, newStatus: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMin(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function firstName(name: string | null): string {
  return name?.split(" ")[0] || "";
}

export default function HandoffPanel({ orders, onStatusChange }: HandoffPanelProps) {
  const pickupReady = orders.filter((o) => o.status === "ready" && o.orderType === "pickup");
  const deliveryReady = orders.filter((o) => o.status === "ready" && o.orderType === "delivery");
  const delivering = orders.filter((o) => o.status === "delivering");

  return (
    <div className="d-flex flex-column gap-3">
      {/* Click & Collect READY */}
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className="bi bi-bag-check text-success"></i>
          <small className="fw-bold text-uppercase" style={{ fontSize: "0.7rem", letterSpacing: "0.05em" }}>
            Click & Collect
          </small>
          <span className="badge bg-success rounded-pill">{pickupReady.length}</span>
        </div>
        {pickupReady.length === 0 ? (
          <small className="text-muted">Aucune</small>
        ) : (
          <div className="d-flex flex-column gap-1">
            {pickupReady.map((order) => (
              <div key={order.id} className="card border" style={{ fontSize: "0.85rem" }}>
                <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                  <span className="fw-bold" style={{ minWidth: 45 }}>
                    {formatTime(order.estimatedReadyAt)}
                  </span>
                  <span className="flex-grow-1 text-truncate">
                    {firstName(order.customerName) || formatPhoneDisplay(order.customerPhone)}
                    {firstName(order.customerName) && order.customerPhone && (
                      <small className="text-muted ms-1">{formatPhoneDisplay(order.customerPhone)}</small>
                    )}
                  </span>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => onStatusChange(order.id, "completed")}
                  >
                    <i className="bi bi-check2-circle me-1"></i>Remis
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="my-1" />

      {/* Delivery READY */}
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className="bi bi-truck text-primary"></i>
          <small className="fw-bold text-uppercase" style={{ fontSize: "0.7rem", letterSpacing: "0.05em" }}>
            Livraison Prête
          </small>
          <span className="badge bg-primary rounded-pill">{deliveryReady.length}</span>
        </div>
        {deliveryReady.length === 0 ? (
          <small className="text-muted">Aucune</small>
        ) : (
          <div className="d-flex flex-column gap-1">
            {deliveryReady.map((order) => (
              <div key={order.id} className="card border" style={{ fontSize: "0.85rem" }}>
                <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                  <span className="fw-bold" style={{ minWidth: 45 }}>
                    {formatTime(order.handoffAt)}
                  </span>
                  <span className="flex-grow-1 text-truncate">
                    {firstName(order.customerName) || formatPhoneDisplay(order.customerPhone)}
                    {firstName(order.customerName) && order.customerPhone && (
                      <small className="text-muted ms-1">{formatPhoneDisplay(order.customerPhone)}</small>
                    )}
                  </span>
                  <small className="text-muted text-truncate" style={{ maxWidth: 120 }}>
                    {order.deliveryAddress}
                  </small>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onStatusChange(order.id, "delivering")}
                  >
                    <i className="bi bi-bicycle me-1"></i>Pris
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="my-1" />

      {/* In delivery */}
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className="bi bi-geo-alt text-info"></i>
          <small className="fw-bold text-uppercase" style={{ fontSize: "0.7rem", letterSpacing: "0.05em" }}>
            En livraison
          </small>
          <span className="badge bg-info rounded-pill">{delivering.length}</span>
        </div>
        {delivering.length === 0 ? (
          <small className="text-muted">Aucune</small>
        ) : (
          <div className="d-flex flex-column gap-1">
            {delivering.map((order) => (
              <div key={order.id} className="card border" style={{ fontSize: "0.85rem" }}>
                <div className="card-body py-2 px-3 d-flex align-items-center gap-2">
                  <span className="flex-grow-1 text-truncate">
                    {firstName(order.customerName) || formatPhoneDisplay(order.customerPhone)}
                    {firstName(order.customerName) && order.customerPhone && (
                      <small className="text-muted ms-1">{formatPhoneDisplay(order.customerPhone)}</small>
                    )}
                  </span>
                  <small className="text-muted">
                    <i className="bi bi-clock me-1"></i>
                    {formatTime(order.estimatedReadyAt)}
                  </small>
                  <button
                    className="btn btn-sm btn-outline-success"
                    onClick={() => onStatusChange(order.id, "completed")}
                  >
                    <i className="bi bi-check2-all me-1"></i>Livré
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
