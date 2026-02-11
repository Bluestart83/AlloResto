"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { TripStop } from "@/db/entities/DeliveryTrip";

interface Trip {
  id: string;
  restaurantId: string;
  status: string;
  stops: TripStop[];
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  orderCount: number;
  googleMapsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function RouteSheetPage() {
  const { restaurantId, tripId } = useParams<{ restaurantId: string; tripId: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchTrip = useCallback(() => {
    fetch(`/api/delivery-trips/${tripId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setTrip(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
    const interval = setInterval(fetchTrip, 30_000);
    return () => clearInterval(interval);
  }, [fetchTrip]);

  const handleDeliverStop = async (orderId: string) => {
    setDelivering(orderId);
    try {
      await fetch(`/api/delivery-trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deliver_stop", orderId }),
      });
      fetchTrip();
    } finally {
      setDelivering(null);
    }
  };

  const handleComplete = async () => {
    await fetch(`/api/delivery-trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    fetchTrip();
  };

  const handleCancel = async () => {
    if (!confirm("Annuler cette tournee ? Les commandes repasseront en statut 'prete'.")) return;
    setCancelling(true);
    await fetch(`/api/delivery-trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    router.push(`/place/${restaurantId}/livraisons`);
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border text-primary"></span>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Tournee introuvable</p>
      </div>
    );
  }

  const sortedStops = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  const deliveredCount = sortedStops.filter((s) => s.deliveredAt).length;
  const allDelivered = deliveredCount === sortedStops.length;
  const isActive = trip.status === "in_progress" || trip.status === "planning";

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => router.push(`/place/${restaurantId}/livraisons`)}
        >
          <i className="bi bi-arrow-left me-1"></i>Retour
        </button>
        <h5 className="fw-bold mb-0">
          <i className="bi bi-signpost-split me-2"></i>Feuille de route
        </h5>
        {trip.googleMapsUrl && (
          <a
            href={trip.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-primary"
          >
            <i className="bi bi-geo-alt-fill me-1"></i>GPS
          </a>
        )}
      </div>

      {/* Summary */}
      <div className="card mb-3">
        <div className="card-body py-2 px-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <span className="fw-bold">{trip.orderCount} arret(s)</span>
              {trip.totalDistanceKm && (
                <span className="text-muted ms-2">{trip.totalDistanceKm} km</span>
              )}
              {trip.totalDurationMin && (
                <span className="text-muted ms-2">~{trip.totalDurationMin} min</span>
              )}
            </div>
            <span className={`badge ${
              trip.status === "completed" ? "bg-success" :
              trip.status === "cancelled" ? "bg-secondary" :
              "bg-primary"
            }`}>
              {trip.status === "in_progress" ? "En cours" :
               trip.status === "completed" ? "Terminee" :
               trip.status === "cancelled" ? "Annulee" :
               trip.status}
            </span>
          </div>
          {isActive && (
            <div className="mt-1">
              <small className="text-muted">
                {deliveredCount}/{sortedStops.length} livree(s)
              </small>
              <div className="progress mt-1" style={{ height: 4 }}>
                <div
                  className="progress-bar bg-success"
                  style={{ width: `${(deliveredCount / sortedStops.length) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stops */}
      <div className="d-flex flex-column gap-2 mb-4">
        {sortedStops.map((stop, idx) => {
          const isDelivered = !!stop.deliveredAt;
          return (
            <div
              key={stop.orderId}
              className={`card border ${isDelivered ? "border-success bg-light" : ""}`}
              style={isDelivered ? { opacity: 0.7 } : undefined}
            >
              <div className="card-body py-3 px-3">
                <div className="d-flex align-items-start gap-3">
                  {/* Sequence number */}
                  <div
                    className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 ${
                      isDelivered ? "bg-success" : "bg-primary"
                    }`}
                    style={{ width: 32, height: 32, color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    {isDelivered ? (
                      <i className="bi bi-check-lg"></i>
                    ) : (
                      idx + 1
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="fw-bold">{stop.customerName || "Client"}</div>
                      {stop.customerPhone && (
                        <a
                          href={`tel:${stop.customerPhone}`}
                          className="btn btn-sm btn-outline-secondary py-0 px-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <i className="bi bi-telephone"></i>
                        </a>
                      )}
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                      <i className="bi bi-geo-alt me-1"></i>{stop.deliveryAddress}
                    </div>
                    <div className="d-flex gap-3 mt-1" style={{ fontSize: "0.8rem" }}>
                      <span className="text-muted">
                        {stop.itemCount} article(s) · {Number(stop.orderTotal).toFixed(2)} EUR
                      </span>
                      {stop.legDistanceKm != null && (
                        <span className="text-info">
                          +{stop.legDistanceKm} km · ~{stop.legDurationMin} min
                        </span>
                      )}
                      {stop.estimatedArrival && (
                        <span className="fw-medium">
                          ETA {formatTime(stop.estimatedArrival)}
                        </span>
                      )}
                    </div>
                    {stop.notes && (
                      <div className="text-warning mt-1" style={{ fontSize: "0.8rem" }}>
                        <i className="bi bi-exclamation-triangle me-1"></i>{stop.notes}
                      </div>
                    )}
                    {isDelivered && (
                      <div className="text-success mt-1" style={{ fontSize: "0.8rem" }}>
                        <i className="bi bi-check-circle me-1"></i>
                        Livre a {formatTime(stop.deliveredAt)}
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  {isActive && !isDelivered && (
                    <button
                      className="btn btn-sm btn-success flex-shrink-0"
                      onClick={() => handleDeliverStop(stop.orderId)}
                      disabled={delivering === stop.orderId}
                    >
                      {delivering === stop.orderId ? (
                        <span className="spinner-border spinner-border-sm"></span>
                      ) : (
                        <>
                          <i className="bi bi-check2 me-1"></i>Livre
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      {isActive && (
        <div className="d-flex flex-column gap-2 mb-4">
          {trip.googleMapsUrl && (
            <a
              href={trip.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-100"
            >
              <i className="bi bi-map me-2"></i>Ouvrir dans Google Maps
            </a>
          )}
          {allDelivered && (
            <button className="btn btn-success w-100" onClick={handleComplete}>
              <i className="bi bi-check-circle me-2"></i>Terminer la tournee
            </button>
          )}
          <button
            className="btn btn-outline-danger w-100"
            onClick={handleCancel}
            disabled={cancelling}
          >
            <i className="bi bi-x-circle me-2"></i>Annuler la tournee
          </button>
        </div>
      )}
    </div>
  );
}
