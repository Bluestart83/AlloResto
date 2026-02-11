"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SERVICE_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "brunch", label: "Brunch" },
  { value: "evenement", label: "Evenement" },
];

interface ServiceUI {
  id?: string;
  name: string;
  type: string;
  dayOfWeek: number[];
  startTime: string;
  endTime: string;
  lastSeatingTime: string;
  maxCovers: number;
  minPartySize: number;
  maxPartySize: number | null;
  slotIntervalMin: number;
  defaultDurationMin: number;
  requiresPrepayment: boolean;
  prepaymentAmount: number | null;
  autoConfirm: boolean;
  diningRoomIds: string[] | null;
  isPrivate: boolean;
  isActive: boolean;
}

interface DiningRoom {
  id: string;
  name: string;
}

const EMPTY_SERVICE: ServiceUI = {
  name: "",
  type: "standard",
  dayOfWeek: [1, 2, 3, 4, 5],
  startTime: "12:00",
  endTime: "14:30",
  lastSeatingTime: "14:00",
  maxCovers: 40,
  minPartySize: 1,
  maxPartySize: null,
  slotIntervalMin: 30,
  defaultDurationMin: 90,
  requiresPrepayment: false,
  prepaymentAmount: null,
  autoConfirm: true,
  diningRoomIds: null,
  isPrivate: false,
  isActive: true,
};

export default function ServicesPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [services, setServices] = useState<(ServiceUI & { id: string })[]>([]);
  const [rooms, setRooms] = useState<DiningRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceUI | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch(`/api/dining-services?restaurantId=${restaurantId}`).then((r) => r.json()),
      fetch(`/api/rooms?restaurantId=${restaurantId}`).then((r) => r.json()),
    ]).then(([sData, rData]) => {
      setServices(Array.isArray(sData) ? sData : []);
      setRooms(Array.isArray(rData) ? rData.map((r: any) => ({ id: r.id, name: r.name })) : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [restaurantId]);

  const saveService = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const body = isNew
        ? { ...editing, restaurantId }
        : { id: editing.id, ...editing };
      await fetch("/api/dining-services", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditing(null);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (id: string) => {
    if (!confirm("Supprimer ce service ?")) return;
    await fetch(`/api/dining-services?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  const toggleDay = (day: number) => {
    if (!editing) return;
    const days = editing.dayOfWeek.includes(day)
      ? editing.dayOfWeek.filter((d) => d !== day)
      : [...editing.dayOfWeek, day].sort();
    setEditing({ ...editing, dayOfWeek: days });
  };

  const toggleRoom = (roomId: string) => {
    if (!editing) return;
    const current = editing.diningRoomIds || [];
    const next = current.includes(roomId)
      ? current.filter((id) => id !== roomId)
      : [...current, roomId];
    setEditing({ ...editing, diningRoomIds: next.length > 0 ? next : null });
  };

  const daysLabel = (days: number[]) =>
    days.map((d) => DAY_LABELS[d - 1] || d).join(", ");

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Services</h4>
          <small className="text-muted">
            {services.filter((s) => s.isActive).length} service(s) actif(s) sur {services.length}
          </small>
        </div>
        {!editing && (
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ ...EMPTY_SERVICE })}
          >
            <i className="bi bi-plus-lg me-1"></i>Ajouter un service
          </button>
        )}
      </div>

      {/* Edit / Add form */}
      {editing && (
        <div className="card mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>
              <i className="bi bi-clock-history me-2"></i>
              {editing.id ? "Modifier le service" : "Nouveau service"}
            </strong>
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              <label className="form-check-label small">
                {editing.isActive ? "Actif" : "Inactif"}
              </label>
            </div>
          </div>
          <div className="card-body">
            <div className="row g-3">
              {/* Name + Type */}
              <div className="col-md-6">
                <label className="form-label">Nom</label>
                <input
                  className="form-control"
                  placeholder="Ex: Dejeuner, Diner, Brunch..."
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={editing.type}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                >
                  {SERVICE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Days */}
              <div className="col-12">
                <label className="form-label">Jours</label>
                <div className="d-flex gap-2">
                  {DAY_LABELS.map((label, i) => {
                    const day = i + 1;
                    const active = editing.dayOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                        onClick={() => toggleDay(day)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Times */}
              <div className="col-md-4">
                <label className="form-label">Debut</label>
                <input
                  type="time"
                  className="form-control"
                  value={editing.startTime}
                  onChange={(e) => setEditing({ ...editing, startTime: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Fin</label>
                <input
                  type="time"
                  className="form-control"
                  value={editing.endTime}
                  onChange={(e) => setEditing({ ...editing, endTime: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Derniere prise en charge</label>
                <input
                  type="time"
                  className="form-control"
                  value={editing.lastSeatingTime || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, lastSeatingTime: e.target.value || "" })
                  }
                />
              </div>

              {/* Capacity */}
              <div className="col-md-3">
                <label className="form-label">Couverts max</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={editing.maxCovers}
                  onChange={(e) => setEditing({ ...editing, maxCovers: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Intervalle creneaux (min)</label>
                <input
                  type="number"
                  className="form-control"
                  min={5}
                  step={5}
                  value={editing.slotIntervalMin}
                  onChange={(e) =>
                    setEditing({ ...editing, slotIntervalMin: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Duree repas (min)</label>
                <input
                  type="number"
                  className="form-control"
                  min={15}
                  step={15}
                  value={editing.defaultDurationMin}
                  onChange={(e) =>
                    setEditing({ ...editing, defaultDurationMin: parseInt(e.target.value) || 90 })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Taille groupe</label>
                <div className="d-flex gap-1">
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    placeholder="Min"
                    value={editing.minPartySize}
                    onChange={(e) =>
                      setEditing({ ...editing, minPartySize: parseInt(e.target.value) || 1 })
                    }
                  />
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    placeholder="Max"
                    value={editing.maxPartySize ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maxPartySize: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>

              {/* Dining rooms */}
              {rooms.length > 0 && (
                <div className="col-12">
                  <label className="form-label">
                    Salles concernees
                    <small className="text-muted ms-1">(vide = toutes)</small>
                  </label>
                  <div className="d-flex gap-2 flex-wrap">
                    {rooms.map((room) => {
                      const active = editing.diningRoomIds?.includes(room.id) ?? false;
                      return (
                        <button
                          key={room.id}
                          type="button"
                          className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                          onClick={() => toggleRoom(room.id)}
                        >
                          {room.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.autoConfirm}
                    onChange={(e) => setEditing({ ...editing, autoConfirm: e.target.checked })}
                  />
                  <label className="form-check-label">Confirmation auto</label>
                </div>
              </div>
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.requiresPrepayment}
                    onChange={(e) =>
                      setEditing({ ...editing, requiresPrepayment: e.target.checked })
                    }
                  />
                  <label className="form-check-label">Prepaiement</label>
                </div>
              </div>
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.isPrivate}
                    onChange={(e) => setEditing({ ...editing, isPrivate: e.target.checked })}
                  />
                  <label className="form-check-label">Prive</label>
                </div>
              </div>

              {editing.requiresPrepayment && (
                <div className="col-md-4">
                  <label className="form-label">Montant prepaiement</label>
                  <div className="input-group">
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      step={0.5}
                      value={editing.prepaymentAmount ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          prepaymentAmount: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                    />
                    <span className="input-group-text">&euro;</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="d-flex gap-2 mt-4">
              <button
                className="btn btn-primary"
                disabled={saving || !editing.name.trim() || editing.dayOfWeek.length === 0}
                onClick={saveService}
              >
                {saving ? (
                  <span className="spinner-border spinner-border-sm me-1"></span>
                ) : (
                  <i className="bi bi-check-lg me-1"></i>
                )}
                {editing.id ? "Enregistrer" : "Creer"}
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setEditing(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : services.length === 0 && !editing ? (
        <div className="text-center py-5">
          <i className="bi bi-clock-history fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucun service configure</p>
          <p className="text-muted small">
            Creez des services (Dejeuner, Diner, Brunch...) pour gerer les creneaux de reservation.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {services.map((svc) => (
            <div key={svc.id} className={`card ${!svc.isActive ? "opacity-50" : ""}`}>
              <div className="card-body d-flex justify-content-between align-items-center">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <strong>{svc.name}</strong>
                    <span className={`badge ${svc.isActive ? "bg-success" : "bg-secondary"}`}>
                      {svc.isActive ? "Actif" : "Inactif"}
                    </span>
                    <span className="badge bg-info">{svc.type}</span>
                    {svc.requiresPrepayment && (
                      <span className="badge bg-warning text-dark">Prepaiement</span>
                    )}
                    {svc.isPrivate && (
                      <span className="badge bg-dark">Prive</span>
                    )}
                  </div>
                  <small className="text-muted">
                    {daysLabel(svc.dayOfWeek)} · {svc.startTime}–{svc.endTime}
                    {svc.lastSeatingTime ? ` (dernier accueil ${svc.lastSeatingTime})` : ""}
                    {" · "}
                    {svc.maxCovers} couverts max · {svc.defaultDurationMin} min
                    {svc.slotIntervalMin !== 30 ? ` · creneaux ${svc.slotIntervalMin} min` : ""}
                  </small>
                </div>
                <div className="d-flex gap-1">
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => setEditing({ ...svc })}
                  >
                    <i className="bi bi-pencil"></i>
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => deleteService(svc.id)}
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
