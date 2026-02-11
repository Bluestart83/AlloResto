"use client";

import type { TimelineOrderInfo } from "@/types/planning";
import { formatPhoneDisplay } from "@/lib/format-phone";

interface KitchenQueueProps {
  orders: TimelineOrderInfo[];
  onStatusChange: (orderId: string, newStatus: string) => void;
}

const SIZE_BADGES: Record<string, { label: string; color: string }> = {
  S: { label: "S", color: "#10b981" },
  M: { label: "M", color: "#f59e0b" },
  L: { label: "L", color: "#ef4444" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function isLate(cookStartAt: string | null, status: string): boolean {
  if (!cookStartAt) return false;
  if (!["pending", "confirmed"].includes(status)) return false;
  return new Date(cookStartAt) < new Date();
}

function formatLate(cookStartAt: string): string {
  const min = Math.round((Date.now() - new Date(cookStartAt).getTime()) / 60_000);
  if (min < 60) return `+${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `+${h}h${String(m).padStart(2, "0")}` : `+${h}h`;
}

function firstName(name: string | null): string {
  return name?.split(" ")[0] || "";
}

export default function KitchenQueue({ orders, onStatusChange }: KitchenQueueProps) {
  // Filter to orders that should show in kitchen (not yet ready)
  const kitchenOrders = orders
    .filter((o) => ["pending", "confirmed", "preparing"].includes(o.status))
    .sort((a, b) => {
      const ta = a.cookStartAt ? new Date(a.cookStartAt).getTime() : Infinity;
      const tb = b.cookStartAt ? new Date(b.cookStartAt).getTime() : Infinity;
      return ta - tb;
    });

  if (kitchenOrders.length === 0) {
    return (
      <div className="text-center py-4">
        <i className="bi bi-check-circle fs-3 text-muted d-block mb-2"></i>
        <small className="text-muted">Aucune commande en cuisine</small>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {kitchenOrders.map((order) => {
        const late = isLate(order.cookStartAt, order.status);
        const sizeBadge = SIZE_BADGES[order.orderSize || "M"];

        return (
          <div
            key={order.id}
            className={`card border ${late ? "border-danger" : ""}`}
            style={{ fontSize: "0.85rem" }}
          >
            <div className="card-body py-2 px-3">
              <div className="d-flex align-items-center gap-2 mb-1">
                {/* Timing */}
                <span className="fw-bold" style={{ minWidth: 45 }}>
                  {formatTime(order.cookStartAt)}
                </span>

                {/* Size badge */}
                <span
                  className="badge"
                  style={{ backgroundColor: sizeBadge.color, fontSize: "0.7rem" }}
                >
                  {sizeBadge.label}
                </span>

                {/* Order type icon */}
                <i
                  className={`bi ${order.orderType === "delivery" ? "bi-truck" : order.orderType === "dine_in" ? "bi-cup-straw" : "bi-bag"}`}
                  title={order.orderType}
                ></i>

                {/* Customer */}
                <span className="flex-grow-1 text-truncate">
                  {firstName(order.customerName) || formatPhoneDisplay(order.customerPhone)}
                  {firstName(order.customerName) && order.customerPhone && (
                    <small className="text-muted ms-1">{formatPhoneDisplay(order.customerPhone)}</small>
                  )}
                </span>

                {/* Item count */}
                <small className="text-muted">{order.itemCount} art.</small>

                {/* Late badge */}
                {late && order.cookStartAt && (
                  <span className="badge bg-danger" style={{ fontSize: "0.65rem" }}>
                    {formatLate(order.cookStartAt)}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="d-flex gap-2 mt-1">
                {(order.status === "pending" || order.status === "confirmed") && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => onStatusChange(order.id, "preparing")}
                  >
                    <i className="bi bi-play-fill me-1"></i>Démarrer
                  </button>
                )}
                {order.status === "preparing" && (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => onStatusChange(order.id, "ready")}
                  >
                    <i className="bi bi-check-lg me-1"></i>Prête
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
