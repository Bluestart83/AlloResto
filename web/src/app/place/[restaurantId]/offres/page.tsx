"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const OFFER_TYPES = [
  { value: "menu", label: "Menu / Formule" },
  { value: "promo", label: "Promotion" },
  { value: "happy_hour", label: "Happy Hour" },
  { value: "evenement", label: "Evenement" },
];

const PREPAYMENT_TYPES = [
  { value: "per_person", label: "Par personne" },
  { value: "flat", label: "Forfait" },
];

interface OfferUI {
  id?: string;
  name: string;
  description: string;
  type: string;
  menuItemId: string | null;
  discountPercent: number | null;
  startDate: string;
  endDate: string;
  isPermanent: boolean;
  minPartySize: number | null;
  maxPartySize: number | null;
  minDishes: number | null;
  maxDishes: number | null;
  hasPrepayment: boolean;
  prepaymentAmount: number | null;
  prepaymentType: string | null;
  isBookable: boolean;
  isActive: boolean;
}

interface FormuleOption {
  id: string;
  name: string;
  price: number;
}

const EMPTY_OFFER: OfferUI = {
  name: "",
  description: "",
  type: "menu",
  menuItemId: null,
  discountPercent: null,
  startDate: "",
  endDate: "",
  isPermanent: false,
  minPartySize: null,
  maxPartySize: null,
  minDishes: null,
  maxDishes: null,
  hasPrepayment: false,
  prepaymentAmount: null,
  prepaymentType: null,
  isBookable: true,
  isActive: true,
};

export default function OffresPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [offers, setOffers] = useState<(OfferUI & { id: string })[]>([]);
  const [formules, setFormules] = useState<FormuleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OfferUI | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch(`/api/offers?restaurantId=${restaurantId}`).then((r) => r.json()),
      fetch(`/api/menu?restaurantId=${restaurantId}`).then((r) => r.json()),
    ]).then(([oData, mData]) => {
      setOffers(Array.isArray(oData) ? oData : []);
      // Formules = items sans catégorie
      const items = mData?.items || mData || [];
      const f = (Array.isArray(items) ? items : [])
        .filter((i: any) => i.categoryId === null)
        .map((i: any) => ({ id: i.id, name: i.name, price: Number(i.price) }));
      setFormules(f);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [restaurantId]);

  const saveOffer = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const body = isNew
        ? { ...editing, restaurantId }
        : { id: editing.id, ...editing };
      await fetch("/api/offers", {
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

  const deleteOffer = async (id: string) => {
    if (!confirm("Supprimer cette offre ?")) return;
    await fetch(`/api/offers?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  const linkedFormule = (menuItemId: string | null) =>
    menuItemId ? formules.find((f) => f.id === menuItemId) : null;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Offres</h4>
          <small className="text-muted">
            {offers.filter((o) => o.isActive).length} offre(s) active(s) sur {offers.length}
          </small>
        </div>
        {!editing && (
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ ...EMPTY_OFFER })}
          >
            <i className="bi bi-plus-lg me-1"></i>Ajouter une offre
          </button>
        )}
      </div>

      {/* Edit / Add form */}
      {editing && (
        <div className="card mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>
              <i className="bi bi-gift me-2"></i>
              {editing.id ? "Modifier l'offre" : "Nouvelle offre"}
            </strong>
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              <label className="form-check-label small">
                {editing.isActive ? "Active" : "Inactive"}
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
                  placeholder="Ex: Menu Decouverte, Happy Hour..."
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
                  {OFFER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="col-12">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Description de l'offre..."
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>

              {/* Linked formule */}
              <div className="col-md-6">
                <label className="form-label">
                  Formule liee <small className="text-muted">(optionnel)</small>
                </label>
                <select
                  className="form-select"
                  value={editing.menuItemId || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, menuItemId: e.target.value || null })
                  }
                >
                  <option value="">Aucune</option>
                  {formules.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.price.toFixed(2)}&euro;)
                    </option>
                  ))}
                </select>
              </div>

              {/* Discount */}
              <div className="col-md-6">
                <label className="form-label">Remise %</label>
                <div className="input-group">
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={100}
                    value={editing.discountPercent ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        discountPercent: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  />
                  <span className="input-group-text">%</span>
                </div>
              </div>

              {/* Dates */}
              <div className="col-md-4">
                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.isPermanent}
                    onChange={(e) => setEditing({ ...editing, isPermanent: e.target.checked })}
                  />
                  <label className="form-check-label">Permanente</label>
                </div>
              </div>
              {!editing.isPermanent && (
                <>
                  <div className="col-md-4">
                    <label className="form-label">Date debut</label>
                    <input
                      type="date"
                      className="form-control"
                      value={editing.startDate}
                      onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Date fin</label>
                    <input
                      type="date"
                      className="form-control"
                      value={editing.endDate}
                      onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Party size */}
              <div className="col-md-3">
                <label className="form-label">Min personnes</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={editing.minPartySize ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      minPartySize: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Max personnes</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={editing.maxPartySize ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxPartySize: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Min plats</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={editing.minDishes ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      minDishes: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Max plats</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={editing.maxDishes ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxDishes: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>

              {/* Prepayment */}
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.hasPrepayment}
                    onChange={(e) =>
                      setEditing({ ...editing, hasPrepayment: e.target.checked })
                    }
                  />
                  <label className="form-check-label">Prepaiement</label>
                </div>
              </div>
              {editing.hasPrepayment && (
                <>
                  <div className="col-md-4">
                    <label className="form-label">Montant</label>
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
                  <div className="col-md-4">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={editing.prepaymentType || "per_person"}
                      onChange={(e) =>
                        setEditing({ ...editing, prepaymentType: e.target.value })
                      }
                    >
                      {PREPAYMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Bookable */}
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={editing.isBookable}
                    onChange={(e) => setEditing({ ...editing, isBookable: e.target.checked })}
                  />
                  <label className="form-check-label">Reservable en ligne</label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="d-flex gap-2 mt-4">
              <button
                className="btn btn-primary"
                disabled={saving || !editing.name.trim()}
                onClick={saveOffer}
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
      ) : offers.length === 0 && !editing ? (
        <div className="text-center py-5">
          <i className="bi bi-gift fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune offre configuree</p>
          <p className="text-muted small">
            Creez des offres (menu, promo, happy hour...) pour les proposer a vos clients.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {offers.map((offer) => {
            const formule = linkedFormule(offer.menuItemId);
            return (
              <div key={offer.id} className={`card ${!offer.isActive ? "opacity-50" : ""}`}>
                <div className="card-body d-flex justify-content-between align-items-start">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <strong>{offer.name}</strong>
                      <span className={`badge ${offer.isActive ? "bg-success" : "bg-secondary"}`}>
                        {offer.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="badge bg-info">
                        {OFFER_TYPES.find((t) => t.value === offer.type)?.label || offer.type}
                      </span>
                      {offer.isPermanent && <span className="badge bg-primary">Permanente</span>}
                      {offer.isBookable && <span className="badge bg-outline-primary border">Reservable</span>}
                      {offer.hasPrepayment && (
                        <span className="badge bg-warning text-dark">
                          Prepaiement {offer.prepaymentAmount}&euro;
                        </span>
                      )}
                      {offer.discountPercent != null && (
                        <span className="badge bg-danger">-{offer.discountPercent}%</span>
                      )}
                    </div>
                    {offer.description && (
                      <p className="text-muted mb-1 small">{offer.description}</p>
                    )}
                    <small className="text-muted">
                      {formule && (
                        <span className="me-2">
                          <i className="bi bi-collection me-1"></i>
                          {formule.name} ({formule.price.toFixed(2)}&euro;)
                        </span>
                      )}
                      {!offer.isPermanent && offer.startDate && (
                        <span className="me-2">
                          <i className="bi bi-calendar me-1"></i>
                          {offer.startDate} → {offer.endDate || "..."}
                        </span>
                      )}
                      {(offer.minPartySize || offer.maxPartySize) && (
                        <span className="me-2">
                          <i className="bi bi-people me-1"></i>
                          {offer.minPartySize || 1}–{offer.maxPartySize || "∞"} pers.
                        </span>
                      )}
                    </small>
                  </div>
                  <div className="d-flex gap-1">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() =>
                        setEditing({
                          ...offer,
                          description: offer.description || "",
                          startDate: offer.startDate || "",
                          endDate: offer.endDate || "",
                        })
                      }
                    >
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => deleteOffer(offer.id)}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
