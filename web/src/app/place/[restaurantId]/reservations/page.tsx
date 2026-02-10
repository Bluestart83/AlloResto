"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const STATUS_LABELS: Record<string, { label: string; bg: string }> = {
  pending: { label: "En attente", bg: "bg-warning" },
  confirmed: { label: "Confirmée", bg: "bg-primary" },
  seated: { label: "Installé", bg: "bg-info" },
  completed: { label: "Terminée", bg: "bg-success" },
  cancelled: { label: "Annulée", bg: "bg-danger" },
  no_show: { label: "No-show", bg: "bg-dark" },
};

const SEATING_PREF_LABELS: Record<string, string> = {
  window: "Fenetre",
  outdoor: "Exterieur",
  large_table: "Grande table",
  quiet: "Coin calme",
  bar: "Bar",
};

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["seated", "cancelled", "no_show"],
  seated: ["completed"],
};

export default function ReservationsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [showAddForm, setShowAddForm] = useState(false);

  // New reservation form
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPartySize, setNewPartySize] = useState(2);
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTime, setNewTime] = useState("19:00");
  const [newNotes, setNewNotes] = useState("");
  const [newSeatingPref, setNewSeatingPref] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchReservations = () => {
    let url = `/api/reservations?restaurantId=${restaurantId}`;
    if (dateFilter) url += `&date=${dateFilter}`;
    if (statusFilter !== "all") url += `&status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setReservations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchReservations();
  }, [restaurantId, statusFilter, dateFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch("/api/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchReservations();
  };

  const handleAddReservation = async () => {
    if (!newPhone.trim() || !newDate || !newTime) return;
    setAdding(true);
    try {
      const reservationTime = new Date(`${newDate}T${newTime}:00`).toISOString();
      await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          customerName: newName.trim() || null,
          customerPhone: newPhone.trim(),
          partySize: newPartySize,
          reservationTime,
          status: "confirmed",
          seatingPreference: newSeatingPref || null,
          notes: newNotes.trim() || null,
        }),
      });
      setShowAddForm(false);
      setNewName("");
      setNewPhone("");
      setNewPartySize(2);
      setNewTime("19:00");
      setNewSeatingPref("");
      setNewNotes("");
      fetchReservations();
    } finally {
      setAdding(false);
    }
  };

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = (d: string) => {
    const date = new Date(d);
    return (
      date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
      " " +
      date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Reservations</h4>
          <small className="text-muted">
            {reservations.length} reservation(s)
          </small>
        </div>
        <div className="d-flex gap-2">
          <input
            type="date"
            className="form-control"
            style={{ width: 180 }}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          <button
            className="btn btn-primary d-flex align-items-center gap-1"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <i className={`bi bi-${showAddForm ? "x-lg" : "plus-lg"}`}></i>
            {showAddForm ? "Annuler" : "Ajouter"}
          </button>
        </div>
      </div>

      {/* Add reservation form */}
      {showAddForm && (
        <div className="card mb-4 border-primary">
          <div className="card-header bg-primary text-white">
            <i className="bi bi-calendar-plus me-2"></i>Nouvelle reservation
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Nom du client</label>
                <input
                  className="form-control"
                  placeholder="Nom"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Telephone *</label>
                <input
                  className="form-control"
                  placeholder="06 12 34 56 78"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Personnes</label>
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={50}
                  value={newPartySize}
                  onChange={(e) => setNewPartySize(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Date</label>
                <input
                  className="form-control"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Heure</label>
                <input
                  className="form-control"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Preference placement</label>
                <select
                  className="form-select"
                  value={newSeatingPref}
                  onChange={(e) => setNewSeatingPref(e.target.value)}
                >
                  <option value="">Aucune preference</option>
                  <option value="window">Fenetre</option>
                  <option value="outdoor">Exterieur / Terrasse</option>
                  <option value="large_table">Grande table</option>
                  <option value="quiet">Coin calme</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              <div className="col-md-8">
                <label className="form-label">Notes</label>
                <input
                  className="form-control"
                  placeholder="Anniversaire, allergie..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                className="btn btn-primary"
                disabled={!newPhone.trim() || adding}
                onClick={handleAddReservation}
              >
                {adding ? (
                  <span className="spinner-border spinner-border-sm me-1"></span>
                ) : (
                  <i className="bi bi-check-lg me-1"></i>
                )}
                Confirmer la reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtres status */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        {[
          { key: "all", label: "Toutes" },
          ...Object.entries(STATUS_LABELS).map(([k, v]) => ({
            key: k,
            label: v.label,
          })),
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${statusFilter === key ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setStatusFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-calendar-x fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune reservation</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {reservations.map((resa) => {
            const st = STATUS_LABELS[resa.status] || {
              label: resa.status,
              bg: "bg-secondary",
            };
            const nextStatuses = STATUS_FLOW[resa.status] || [];

            return (
              <div key={resa.id} className="card border">
                <div className="card-body py-3">
                  <div className="d-flex align-items-center gap-3">
                    <span className={`badge ${st.bg}`} style={{ minWidth: 90 }}>
                      {st.label}
                    </span>
                    <div className="flex-grow-1">
                      <div className="fw-medium">
                        {resa.customerName || resa.customerPhone || "Client"}
                      </div>
                      <small className="text-muted">
                        <i className="bi bi-people me-1"></i>
                        {resa.partySize} pers.
                        {resa.customerPhone && (
                          <>
                            {" "}
                            <i className="bi bi-telephone ms-2 me-1"></i>
                            {resa.customerPhone}
                          </>
                        )}
                      </small>
                    </div>
                    <div className="text-end">
                      <div className="fw-bold">
                        <i className="bi bi-clock me-1"></i>
                        {formatTime(resa.reservationTime)}
                      </div>
                      <small className="text-muted">
                        {formatDate(resa.reservationTime)}
                      </small>
                    </div>
                  </div>

                  {(resa.seatingPreference || resa.notes) && (
                    <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                      {resa.seatingPreference && (
                        <span className="badge bg-info text-dark">
                          <i className="bi bi-geo-alt me-1"></i>
                          {SEATING_PREF_LABELS[resa.seatingPreference] || resa.seatingPreference}
                        </span>
                      )}
                      {resa.notes && (
                        <small className="text-muted">
                          <i className="bi bi-sticky me-1"></i>
                          {resa.notes}
                        </small>
                      )}
                    </div>
                  )}

                  {nextStatuses.length > 0 && (
                    <div className="d-flex gap-2 mt-3">
                      {nextStatuses.map((ns) => {
                        const nst = STATUS_LABELS[ns];
                        const isDanger =
                          ns === "cancelled" || ns === "no_show";
                        return (
                          <button
                            key={ns}
                            className={`btn btn-sm ${isDanger ? "btn-outline-danger" : "btn-primary"}`}
                            onClick={() => handleStatusChange(resa.id, ns)}
                          >
                            {isDanger ? (
                              <i className="bi bi-x-lg me-1"></i>
                            ) : (
                              <i className="bi bi-arrow-right me-1"></i>
                            )}
                            {nst?.label || ns}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
