"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Trip {
  id: string;
  status: string;
  orderCount: number;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  googleMapsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

type TabFilter = "active" | "completed" | "all";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusBadge: Record<string, { cls: string; label: string }> = {
  planning: { cls: "bg-warning", label: "Planification" },
  in_progress: { cls: "bg-primary", label: "En cours" },
  completed: { cls: "bg-success", label: "Terminee" },
  cancelled: { cls: "bg-secondary", label: "Annulee" },
};

export default function LivraisonsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("active");

  const fetchTrips = useCallback(() => {
    fetch(`/api/delivery-trips?restaurantId=${restaurantId}&status=${tab}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrips(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [restaurantId, tab]);

  useEffect(() => {
    setLoading(true);
    fetchTrips();
  }, [fetchTrips]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">
          <i className="bi bi-truck me-2"></i>Livraisons
        </h4>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => router.push(`/place/${restaurantId}/planning/courier`)}
        >
          <i className="bi bi-plus-lg me-1"></i>Nouvelle tournee
        </button>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {([
          ["active", "En cours"],
          ["completed", "Terminees"],
          ["all", "Toutes"],
        ] as [TabFilter, string][]).map(([key, label]) => (
          <li className="nav-item" key={key}>
            <button
              className={`nav-link ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : trips.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-truck fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune tournee</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {trips.map((trip) => {
            const badge = statusBadge[trip.status] || { cls: "bg-secondary", label: trip.status };
            return (
              <div
                key={trip.id}
                className="card border"
                style={{ cursor: "pointer" }}
                onClick={() => router.push(`/place/${restaurantId}/livraisons/${trip.id}`)}
              >
                <div className="card-body py-3 px-3">
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
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="mt-1">
                    <small className="text-muted">
                      Creee le {formatDateTime(trip.createdAt)}
                      {trip.completedAt && ` · Terminee le ${formatDateTime(trip.completedAt)}`}
                    </small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
