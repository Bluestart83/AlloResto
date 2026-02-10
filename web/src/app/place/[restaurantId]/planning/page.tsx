"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Timeline from "@/components/planning/Timeline";
import KitchenQueue from "@/components/planning/KitchenQueue";
import HandoffPanel from "@/components/planning/HandoffPanel";
import ExternalLoadModal from "@/components/planning/ExternalLoadModal";
import AvailableSlotsPanel from "@/components/planning/AvailableSlotsPanel";
import type { TimelineSnapshot } from "@/types/planning";

export default function PlanningPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [snapshot, setSnapshot] = useState<TimelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExternalLoadModal, setShowExternalLoadModal] = useState(false);
  const [showSlots, setShowSlots] = useState(false);
  const [now, setNow] = useState(new Date());

  const fetchTimeline = useCallback(() => {
    fetch(`/api/planning/timeline?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.slots) setSnapshot(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [restaurantId]);

  useEffect(() => {
    fetchTimeline();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchTimeline, 30_000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: newStatus }),
    });
    fetchTimeline();
  };

  const handleExternalLoadCreated = () => {
    fetchTimeline();
  };

  const formatClock = () =>
    now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border text-primary"></span>
        <p className="text-muted mt-2">Chargement du planning...</p>
      </div>
    );
  }

  return (
    <>
      {/* ===== A) Top bar ===== */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-3">
          <h4 className="fw-bold mb-0">
            <i className="bi bi-kanban me-2"></i>Planning
          </h4>
          <div
            className="d-flex align-items-center gap-2 px-3 py-1 rounded-3"
            style={{ backgroundColor: "rgba(16,185,129,0.1)" }}
          >
            <span className="live-dot"></span>
            <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 500 }}>
              Service en cours
            </span>
          </div>
          <span className="badge bg-dark fs-6">{formatClock()}</span>
        </div>

        <div className="d-flex gap-2">
          <button
            className={`btn btn-sm ${showSlots ? "btn-info" : "btn-outline-info"}`}
            onClick={() => setShowSlots(!showSlots)}
          >
            <i className="bi bi-calendar3 me-1"></i>Créneaux
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setShowExternalLoadModal(true)}
          >
            <i className="bi bi-plus-circle me-1"></i>Charge externe
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={fetchTimeline}>
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="d-flex gap-3 mb-3" style={{ fontSize: "0.75rem" }}>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "#0d6efd" }}></span>
          Pickup
        </span>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "var(--vo-primary, #4f46e5)" }}></span>
          Livraison
        </span>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "#6b7280" }}></span>
          Charge ext.
        </span>
        <span className="ms-2">
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "#10b981" }}></span>
          OK
        </span>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "#f59e0b" }}></span>
          &gt;70%
        </span>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 12, height: 12, backgroundColor: "#ef4444" }}></span>
          Saturé
        </span>
      </div>

      {/* ===== Available slots panel (collapsible) ===== */}
      {showSlots && (
        <div className="card border mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0">
                <i className="bi bi-calendar3 me-2"></i>Créneaux disponibles
              </h6>
              <button className="btn-close btn-sm" onClick={() => setShowSlots(false)}></button>
            </div>
            <AvailableSlotsPanel restaurantId={restaurantId} />
          </div>
        </div>
      )}

      {/* ===== B) Timeline ===== */}
      {snapshot && (
        <div className="card border mb-3">
          <div className="card-body p-2" style={{ overflowX: "auto" }}>
            <Timeline
              slots={snapshot.slots}
              blocks={snapshot.blocks}
              anchorTime={snapshot.anchorTime}
            />
          </div>
        </div>
      )}

      {/* ===== C) Operational panels ===== */}
      <div className="row g-3">
        {/* Kitchen queue */}
        <div className="col-md-6">
          <div className="card border h-100">
            <div className="card-header bg-white d-flex align-items-center gap-2">
              <i className="bi bi-fire text-danger"></i>
              <strong style={{ fontSize: "0.9rem" }}>Cuisine</strong>
              {snapshot && (
                <span className="badge bg-secondary rounded-pill">
                  {snapshot.orders.filter((o) =>
                    ["pending", "confirmed", "preparing"].includes(o.status)
                  ).length}
                </span>
              )}
            </div>
            <div className="card-body" style={{ maxHeight: 500, overflowY: "auto" }}>
              {snapshot && (
                <KitchenQueue
                  orders={snapshot.orders}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </div>
        </div>

        {/* Handoff / departures */}
        <div className="col-md-6">
          <div className="card border h-100">
            <div className="card-header bg-white d-flex align-items-center gap-2">
              <i className="bi bi-box-arrow-right text-primary"></i>
              <strong style={{ fontSize: "0.9rem" }}>Remise / Départs</strong>
              {snapshot && (
                <span className="badge bg-secondary rounded-pill">
                  {snapshot.orders.filter((o) =>
                    ["ready", "delivering"].includes(o.status)
                  ).length}
                </span>
              )}
            </div>
            <div className="card-body" style={{ maxHeight: 500, overflowY: "auto" }}>
              {snapshot && (
                <HandoffPanel
                  orders={snapshot.orders}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== External Load Modal ===== */}
      {showExternalLoadModal && (
        <ExternalLoadModal
          restaurantId={restaurantId}
          onClose={() => setShowExternalLoadModal(false)}
          onCreated={handleExternalLoadCreated}
        />
      )}
    </>
  );
}
