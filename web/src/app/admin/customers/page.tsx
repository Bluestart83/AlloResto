"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface RestaurantRow {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  cuisineType: string;
  isActive: boolean;
  coverImage: string | null;
  googlePlaceRaw: any;
  createdAt: string;
}

export default function CustomersPage() {
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/restaurants")
      .then((r) => r.json())
      .then((data) => {
        setRestaurants(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      (r.city || "").toLowerCase().includes(filter.toLowerCase())
  );

  const getGoogleMapsUrl = (r: RestaurantRow) => {
    const placeId = r.googlePlaceRaw?.id;
    if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
    return `https://www.google.com/maps/search/${encodeURIComponent(r.name + " " + (r.city || ""))}`;
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Restaurants</h4>
          <small className="text-muted">{restaurants.length} restaurant(s) enregistré(s)</small>
        </div>
        <Link href="/admin/import" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg me-1"></i>Ajouter
        </Link>
      </div>

      {/* Search */}
      <div className="input-group mb-4" style={{ maxWidth: 400 }}>
        <span className="input-group-text bg-dark border-secondary">
          <i className="bi bi-search text-muted"></i>
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Filtrer par nom ou ville..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-shop fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">
            {restaurants.length === 0
              ? "Aucun restaurant enregistré"
              : "Aucun résultat pour ce filtre"}
          </p>
          {restaurants.length === 0 && (
            <Link href="/admin/import" className="btn btn-primary btn-sm">
              Importer un restaurant
            </Link>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {filtered.map((r) => (
            <div key={r.id} className="col-md-6 col-xl-4">
              <Link href={`/place/${r.id}/dashboard`} className="text-decoration-none">
                <div className="card border h-100" style={{ cursor: "pointer", transition: "border-color 0.15s" }}>
                  {r.coverImage && (
                    <div style={{ height: 120, overflow: "hidden" }}>
                      <img
                        src={r.coverImage}
                        alt={r.name}
                        className="w-100 h-100"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  )}
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="fw-bold mb-1">{r.name}</h6>
                        {r.city && (
                          <small className="text-muted">
                            <i className="bi bi-geo-alt me-1"></i>{r.city}
                          </small>
                        )}
                      </div>
                      <span
                        className={`badge ${r.isActive ? "bg-success" : "bg-secondary"}`}
                        style={{ fontSize: "0.65rem" }}
                      >
                        {r.isActive ? "Actif" : "Inactif"}
                      </span>
                    </div>
                    <div className="d-flex align-items-center gap-2 mt-2">
                      {r.phone && (
                        <small className="text-muted">
                          <i className="bi bi-telephone me-1"></i>{r.phone}
                        </small>
                      )}
                      <a
                        href={getGoogleMapsUrl(r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: "0.8rem" }}
                      >
                        <i className="bi bi-google me-1"></i>Maps
                      </a>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
