"use client";

import { useState, useEffect } from "react";
import type { AvailableSlot } from "@/types/planning";

interface AvailableSlotsPanelProps {
  restaurantId: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function AvailableSlotsPanel({ restaurantId }: AvailableSlotsPanelProps) {
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [itemCount, setItemCount] = useState(3);
  const [transitMin, setTransitMin] = useState(15);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSlots = () => {
    setLoading(true);
    const params = new URLSearchParams({
      restaurantId,
      orderType,
      itemCount: String(itemCount),
      transitMin: String(orderType === "delivery" ? transitMin : 0),
    });
    fetch(`/api/planning/available-slots?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSlots();
  }, [restaurantId, orderType, itemCount, transitMin]);

  const feasibleSlots = slots.filter((s) => s.feasible);
  const nextFeasible = feasibleSlots[0];

  return (
    <div>
      {/* Controls */}
      <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <div className="d-flex gap-1">
          <button
            className={`btn btn-sm ${orderType === "pickup" ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setOrderType("pickup")}
          >
            <i className="bi bi-bag me-1"></i>Pickup
          </button>
          <button
            className={`btn btn-sm ${orderType === "delivery" ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setOrderType("delivery")}
          >
            <i className="bi bi-truck me-1"></i>Livraison
          </button>
        </div>

        <div className="input-group input-group-sm" style={{ maxWidth: 130 }}>
          <span className="input-group-text">Articles</span>
          <input
            type="number"
            className="form-control"
            min={1}
            max={20}
            value={itemCount}
            onChange={(e) => setItemCount(parseInt(e.target.value, 10) || 1)}
          />
        </div>

        {orderType === "delivery" && (
          <div className="input-group input-group-sm" style={{ maxWidth: 150 }}>
            <span className="input-group-text">Trajet</span>
            <input
              type="number"
              className="form-control"
              min={5}
              max={60}
              value={transitMin}
              onChange={(e) => setTransitMin(parseInt(e.target.value, 10) || 15)}
            />
            <span className="input-group-text">min</span>
          </div>
        )}

        <button className="btn btn-sm btn-outline-secondary" onClick={fetchSlots}>
          <i className="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      {/* Slot grid */}
      {loading ? (
        <div className="text-center py-3">
          <span className="spinner-border spinner-border-sm text-primary"></span>
        </div>
      ) : feasibleSlots.length === 0 ? (
        <div className="text-center py-3">
          <i className="bi bi-calendar-x fs-4 text-muted d-block mb-1"></i>
          <small className="text-muted">Aucun créneau disponible</small>
        </div>
      ) : (
        <>
          {nextFeasible && (
            <div className="mb-2">
              <small className="text-muted">
                Prochain créneau: <strong>{formatTime(nextFeasible.time)}</strong>
              </small>
            </div>
          )}
          <div className="d-flex gap-1 flex-wrap">
            {slots.slice(0, 36).map((slot, i) => (
              <button
                key={i}
                className={`btn btn-sm ${slot.feasible ? "btn-outline-success" : "btn-outline-secondary"}`}
                disabled={!slot.feasible}
                style={{
                  minWidth: 60,
                  fontSize: "0.75rem",
                  opacity: slot.feasible ? 1 : 0.4,
                }}
                title={slot.feasible ? "Créneau disponible" : "Capacité insuffisante"}
              >
                {formatTime(slot.time)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
