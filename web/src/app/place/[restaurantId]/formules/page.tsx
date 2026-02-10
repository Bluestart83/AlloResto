"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface FormuleOption {
  name: string;
  type: "single_choice" | "multi_choice";
  required: boolean;
  source: "category" | "items";
  categoryId?: string;
  itemIds?: string[];
}

interface Formule {
  id: string;
  name: string;
  description: string | null;
  price: number;
  options: FormuleOption[];
  isAvailable: boolean;
  tags: string[];
  availableFrom: string | null;
  availableTo: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  isAvailable: boolean;
}

/** Détecte si un item est une formule */
function isFormule(item: any): boolean {
  return item.options?.some((o: any) => o.source === "category" || o.source === "items");
}

export default function FormulesPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [formules, setFormules] = useState<Formule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFormule, setEditingFormule] = useState<Formule | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchMenu = () => {
    fetch(`/api/menu?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        const items = data.items || [];
        setAllItems(items.filter((i: any) => !isFormule(i)));
        setFormules(items.filter(isFormule));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchMenu(); }, [restaurantId]);

  const handleSave = async (formule: Partial<Formule> & { id?: string }) => {
    if (formule.id) {
      await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formule.id, ...formule }),
      });
    } else {
      await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { ...formule, restaurantId, categoryId: null } }),
      });
    }
    setEditingFormule(null);
    setShowAdd(false);
    fetchMenu();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/menu?id=${id}&type=item`, { method: "DELETE" });
    fetchMenu();
  };

  const handleToggle = async (f: Formule) => {
    await fetch("/api/menu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, isAvailable: !f.isAvailable }),
    });
    fetchMenu();
  };

  /** Résout le nom d'une catégorie */
  const catName = (id: string) => categories.find((c) => c.id === id)?.name || "?";

  /** Résout les noms + prix des items */
  const itemLabels = (ids: string[]) =>
    ids.map((id) => {
      const item = allItems.find((i) => i.id === id);
      return item ? `${item.name} (${Number(item.price).toFixed(2)}€)` : "?";
    });

  if (loading) {
    return <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Formules</h4>
          <small className="text-muted">{formules.length} formule(s)</small>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <i className="bi bi-plus-lg me-1"></i>Ajouter
        </button>
      </div>

      {(editingFormule || showAdd) && (
        <FormuleModal
          formule={editingFormule || {
            name: "", description: null, price: 0,
            options: [{ name: "", type: "single_choice", required: true, source: "category", categoryId: categories[0]?.id || "", itemIds: [] }],
            isAvailable: true, tags: [], availableFrom: null, availableTo: null,
          } as any}
          categories={categories}
          allItems={allItems}
          onSave={handleSave}
          onClose={() => { setEditingFormule(null); setShowAdd(false); }}
        />
      )}

      {formules.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-collection fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune formule</p>
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            Les formules sont des menus avec choix par catégorie (ex: Menu Midi = Entrée + Plat + Dessert)
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {formules.map((f) => (
            <div key={f.id} className="card border">
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="form-check form-switch mt-1">
                    <input className="form-check-input" type="checkbox" checked={f.isAvailable} onChange={() => handleToggle(f)} />
                  </div>
                  <div className="flex-grow-1" style={{ opacity: f.isAvailable ? 1 : 0.5 }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="fw-bold mb-1">{f.name}</h6>
                        {f.description && <small className="text-muted d-block mb-1">{f.description}</small>}
                        {(f.availableFrom || f.availableTo) && (
                          <small className="text-primary d-block mb-1">
                            <i className="bi bi-clock me-1"></i>
                            {f.availableFrom || "?"} &ndash; {f.availableTo || "?"}
                          </small>
                        )}
                      </div>
                      <div className="fw-bold text-nowrap ms-3">{Number(f.price).toFixed(2)} &euro;</div>
                    </div>

                    <div className="d-flex flex-column gap-2 mt-2">
                      {f.options.map((opt, i) => (
                        <div key={i} className="bg-dark bg-opacity-10 rounded-3 p-2">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <small className="fw-semibold">{opt.name}</small>
                            {opt.required && (
                              <span className="badge bg-warning bg-opacity-75 text-dark" style={{ fontSize: "0.6rem" }}>obligatoire</span>
                            )}
                            {opt.source === "category" && opt.categoryId && (
                              <span className="badge bg-primary bg-opacity-25 text-primary" style={{ fontSize: "0.6rem" }}>
                                <i className="bi bi-folder me-1"></i>{catName(opt.categoryId)}
                              </span>
                            )}
                          </div>
                          {opt.itemIds && opt.itemIds.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1">
                              {itemLabels(opt.itemIds).map((name, j) => (
                                <span key={j} className="badge bg-dark bg-opacity-25" style={{ fontSize: "0.7rem" }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : opt.source === "category" && opt.categoryId ? (
                            <span className="badge bg-success bg-opacity-25 text-success" style={{ fontSize: "0.65rem" }}>
                              <i className="bi bi-check-all me-1"></i>Tous
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingFormule(f)}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(f.id)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================
// MODAL
// ============================================================

function FormuleModal({ formule, categories, allItems, onSave, onClose }: {
  formule: Partial<Formule>;
  categories: Category[];
  allItems: MenuItem[];
  onSave: (f: Partial<Formule>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(formule.name || "");
  const [description, setDescription] = useState(formule.description || "");
  const [price, setPrice] = useState(formule.price ?? 0);
  const [availableFrom, setAvailableFrom] = useState(formule.availableFrom || "");
  const [availableTo, setAvailableTo] = useState(formule.availableTo || "");
  const [options, setOptions] = useState<FormuleOption[]>(
    formule.options?.length
      ? formule.options
      : [{ name: "", type: "single_choice", required: true, source: "category", categoryId: categories[0]?.id || "", itemIds: [] }]
  );
  // Track which category groups are in "Sélection" mode (vs "Tous")
  const [selMode, setSelMode] = useState<boolean[]>(
    () => (formule.options || []).map((o) => !!(o.source === "category" && o.itemIds?.length))
  );

  const addOptionGroup = () => {
    setOptions([...options, {
      name: "", type: "single_choice", required: true,
      source: "category", categoryId: categories[0]?.id || "", itemIds: [],
    }]);
    setSelMode([...selMode, false]);
  };

  const removeOptionGroup = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
    setSelMode(selMode.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, updates: Partial<FormuleOption>) => {
    const updated = [...options];
    updated[idx] = { ...updated[idx], ...updates };
    setOptions(updated);
  };

  const toggleItemId = (groupIdx: number, itemId: string) => {
    const opt = options[groupIdx];
    const current = opt.itemIds || [];
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    updateOption(groupIdx, { itemIds: next });
  };

  const handleSubmit = () => {
    const cleanOptions = options.filter((o) => {
      if (o.source === "category") return !!o.categoryId;
      if (o.source === "items") return (o.itemIds || []).length > 0;
      return false;
    });

    onSave({
      ...formule,
      name,
      description: description || null,
      price,
      availableFrom: availableFrom || null,
      availableTo: availableTo || null,
      options: cleanOptions,
      isAvailable: formule.isAvailable ?? true,
    });
  };

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h6 className="modal-title">{formule.id ? "Modifier" : "Ajouter"} une formule</h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {/* Base info */}
            <div className="row g-3 mb-4">
              <div className="col-md-8">
                <label className="form-label">Nom</label>
                <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Menu Midi" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Prix</label>
                <div className="input-group">
                  <input type="number" step="0.50" className="form-control" value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} />
                  <span className="input-group-text">&euro;</span>
                </div>
              </div>
              <div className="col-12">
                <label className="form-label">Description</label>
                <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Entr&eacute;e + Plat + Dessert" />
              </div>
              <div className="col-md-3">
                <label className="form-label"><i className="bi bi-clock me-1"></i>Disponible de</label>
                <input type="time" className="form-control" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label"><i className="bi bi-clock me-1"></i>&agrave;</label>
                <input type="time" className="form-control" value={availableTo} onChange={(e) => setAvailableTo(e.target.value)} />
              </div>
            </div>

            {/* Option groups */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-semibold mb-0" style={{ fontSize: "0.9rem" }}>
                <i className="bi bi-list-check me-1"></i>Groupes de choix
              </h6>
              <button className="btn btn-outline-primary btn-sm" onClick={addOptionGroup}>
                <i className="bi bi-plus me-1"></i>Groupe
              </button>
            </div>

            {options.map((opt, gi) => (
              <div key={gi} className="card border mb-3">
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="row g-2 flex-grow-1">
                      <div className="col-md-5">
                        <input
                          className="form-control form-control-sm"
                          value={opt.name}
                          onChange={(e) => updateOption(gi, { name: e.target.value })}
                          placeholder="Nom (ex: Entr&eacute;e au choix)"
                        />
                      </div>
                      <div className="col-md-3">
                        <select
                          className="form-select form-select-sm"
                          value={opt.source}
                          onChange={(e) => {
                            const source = e.target.value as "category" | "items";
                            updateOption(gi, {
                              source,
                              categoryId: source === "category" ? (categories[0]?.id || "") : undefined,
                              itemIds: source === "items" ? [] : undefined,
                            });
                          }}
                        >
                          <option value="category">Cat&eacute;gorie</option>
                          <option value="items">Items sp&eacute;cifiques</option>
                        </select>
                      </div>
                      <div className="col-md-2">
                        <div className="form-check mt-1">
                          <input
                            className="form-check-input" type="checkbox"
                            checked={opt.required}
                            onChange={(e) => updateOption(gi, { required: e.target.checked })}
                            id={`req-${gi}`}
                          />
                          <label className="form-check-label" htmlFor={`req-${gi}`} style={{ fontSize: "0.8rem" }}>Requis</label>
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-sm btn-link text-danger p-0 ms-2" onClick={() => removeOptionGroup(gi)}>
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>

                  {/* Source: category */}
                  {opt.source === "category" && (
                    <div className="d-flex flex-column gap-2">
                      <select
                        className="form-select form-select-sm"
                        value={opt.categoryId || ""}
                        onChange={(e) => updateOption(gi, { categoryId: e.target.value, itemIds: [] })}
                      >
                        <option value="">Choisir une cat&eacute;gorie</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({allItems.filter((i) => i.categoryId === c.id).length} items)</option>
                        ))}
                      </select>

                      {opt.categoryId && (
                        <>
                          <div className="d-flex align-items-center gap-2">
                            <span className={`fw-semibold ${!selMode[gi] ? "text-primary" : "text-muted"}`} style={{ fontSize: "0.8rem" }}>Tous</span>
                            <div className="form-check form-switch mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                role="switch"
                                id={`mode-${gi}`}
                                checked={selMode[gi]}
                                onChange={(e) => {
                                  const next = [...selMode];
                                  next[gi] = e.target.checked;
                                  setSelMode(next);
                                  if (e.target.checked) {
                                    const all = allItems.filter((i) => i.categoryId === opt.categoryId).map((i) => i.id);
                                    updateOption(gi, { itemIds: all });
                                  } else {
                                    updateOption(gi, { itemIds: [] });
                                  }
                                }}
                              />
                            </div>
                            <span className={`fw-semibold ${selMode[gi] ? "text-primary" : "text-muted"}`} style={{ fontSize: "0.8rem" }}>S&eacute;lection</span>
                            {selMode[gi] && (
                              <div className="input-group input-group-sm ms-auto" style={{ maxWidth: 200 }}>
                                <span className="input-group-text" style={{ fontSize: "0.75rem" }}>
                                  <i className="bi bi-funnel me-1"></i>Max
                                </span>
                                <input
                                  type="number" step="0.50" className="form-control"
                                  placeholder="Prix"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const max = (e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null;
                                      if (max != null && opt.categoryId) {
                                        const matching = allItems
                                          .filter((i) => i.categoryId === opt.categoryId && i.price <= max)
                                          .map((i) => i.id);
                                        updateOption(gi, { itemIds: matching });
                                      }
                                    }
                                  }}
                                />
                                <span className="input-group-text">&euro;</span>
                              </div>
                            )}
                          </div>

                          {/* Mode Sélection : boutons toggle par item */}
                          {selMode[gi] && (() => {
                            const catItems = allItems.filter((i) => i.categoryId === opt.categoryId);
                            return catItems.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1">
                                {catItems.map((item) => {
                                  const checked = (opt.itemIds || []).includes(item.id);
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className={`btn btn-sm ${checked ? "btn-primary" : "btn-outline-secondary"}`}
                                      style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                                      onClick={() => toggleItemId(gi, item.id)}
                                    >
                                      {item.name} ({Number(item.price).toFixed(2)}&euro;)
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <small className="text-muted">Aucun item dans cette cat&eacute;gorie</small>
                            );
                          })()}

                          {/* Mode Tous : résumé */}
                          {!selMode[gi] && (
                            <small className="text-muted">
                              {allItems.filter((i) => i.categoryId === opt.categoryId).length} item(s) inclus
                            </small>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Source: items */}
                  {opt.source === "items" && (
                    <div>
                      <div className="d-flex flex-wrap gap-1 mb-2">
                        {(opt.itemIds || []).map((id) => {
                          const item = allItems.find((i) => i.id === id);
                          return (
                            <span key={id} className="badge bg-primary d-flex align-items-center gap-1" style={{ fontSize: "0.75rem" }}>
                              {item ? `${item.name} (${Number(item.price).toFixed(2)}€)` : "?"}
                              <button className="btn-close btn-close-white" style={{ fontSize: "0.5rem" }} onClick={() => toggleItemId(gi, id)}></button>
                            </span>
                          );
                        })}
                      </div>
                      <select
                        className="form-select form-select-sm"
                        value=""
                        onChange={(e) => { if (e.target.value) toggleItemId(gi, e.target.value); }}
                      >
                        <option value="">Ajouter un item...</option>
                        {allItems
                          .filter((i) => !(opt.itemIds || []).includes(i.id))
                          .map((i) => (
                            <option key={i.id} value={i.id}>{i.name} ({Number(i.price).toFixed(2)}&euro;)</option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!name.trim() || options.length === 0}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
