"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Category {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

interface Item {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  ingredients: string[];
  allergens: string[];
  tags: string[];
  isAvailable: boolean;
  options: any[];
}

export default function MenuPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addCatId, setAddCatId] = useState<string | null>(null);

  const fetchMenu = () => {
    fetch(`/api/menu?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchMenu(); }, [restaurantId]);

  const handleSaveItem = async (item: Partial<Item> & { id?: string }) => {
    if (item.id) {
      await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...item }),
      });
    } else {
      await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { ...item, restaurantId } }),
      });
    }
    setEditingItem(null);
    setShowAddItem(false);
    fetchMenu();
  };

  const handleDeleteItem = async (id: string) => {
    await fetch(`/api/menu?id=${id}&type=item`, { method: "DELETE" });
    fetchMenu();
  };

  const handleDeleteCategory = async (id: string) => {
    await fetch(`/api/menu?id=${id}&type=category`, { method: "DELETE" });
    fetchMenu();
  };

  const handleSaveCategory = async (cat: Partial<Category> & { id?: string }) => {
    if (cat.id) {
      await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cat.id, type: "category", ...cat }),
      });
    } else {
      await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", data: { ...cat, restaurantId } }),
      });
    }
    setEditingCat(null);
    fetchMenu();
  };

  const handleToggleAvailable = async (item: Item) => {
    await fetch("/api/menu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isAvailable: !item.isAvailable }),
    });
    fetchMenu();
  };

  if (loading) {
    return <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Menu</h4>
          <small className="text-muted">
            {items.length} article(s) · {categories.length} catégorie(s)
          </small>
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setEditingCat({ id: undefined, name: "", displayOrder: categories.length, isActive: true } as any)}
          >
            <i className="bi bi-folder-plus me-1"></i>Catégorie
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAddItem(true); setAddCatId(categories[0]?.id || null); }}>
            <i className="bi bi-plus-lg me-1"></i>Article
          </button>
        </div>
      </div>

      {/* Category edit modal */}
      {editingCat && (
        <CategoryModal
          category={editingCat}
          onSave={handleSaveCategory}
          onClose={() => setEditingCat(null)}
        />
      )}

      {/* Item edit/add modal */}
      {(editingItem || showAddItem) && (
        <ItemModal
          item={editingItem || { categoryId: addCatId, name: "", price: 0, description: null, ingredients: [], allergens: [], tags: [], isAvailable: true, options: [] } as any}
          categories={categories}
          onSave={handleSaveItem}
          onClose={() => { setEditingItem(null); setShowAddItem(false); }}
        />
      )}

      {/* Menu by category */}
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        return (
          <div key={cat.id} className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="text-uppercase text-muted fw-semibold mb-0" style={{ fontSize: "0.8rem" }}>
                {cat.name} ({catItems.length})
              </h6>
              <div className="d-flex gap-1">
                <button className="btn btn-sm btn-link text-muted p-0" onClick={() => setEditingCat(cat)}>
                  <i className="bi bi-pencil" style={{ fontSize: "0.75rem" }}></i>
                </button>
                <button className="btn btn-sm btn-link text-danger p-0" onClick={() => handleDeleteCategory(cat.id)}>
                  <i className="bi bi-trash" style={{ fontSize: "0.75rem" }}></i>
                </button>
              </div>
            </div>
            {catItems.map((item) => (
              <div key={item.id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                <div className="form-check form-switch mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={item.isAvailable}
                    onChange={() => handleToggleAvailable(item)}
                  />
                </div>
                <div className="flex-grow-1" style={{ opacity: item.isAvailable ? 1 : 0.5 }}>
                  <div className="fw-medium">{item.name}</div>
                  {item.description && <small className="text-muted">{item.description}</small>}
                  <div className="d-flex gap-1 mt-1 flex-wrap">
                    {item.allergens.map((a) => (
                      <span key={a} className="badge bg-danger bg-opacity-10 text-danger" style={{ fontSize: "0.65rem" }}>{a}</span>
                    ))}
                    {item.tags.map((t) => (
                      <span key={t} className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: "0.65rem" }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="fw-bold text-nowrap">{Number(item.price).toFixed(2)} €</div>
                <div className="d-flex gap-1">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingItem(item)}>
                    <i className="bi bi-pencil"></i>
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteItem(item.id)}>
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Uncategorized items */}
      {(() => {
        const uncategorized = items.filter((i) => !i.categoryId || !categories.find((c) => c.id === i.categoryId));
        if (uncategorized.length === 0) return null;
        return (
          <div className="mb-4">
            <h6 className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: "0.8rem" }}>
              Sans catégorie ({uncategorized.length})
            </h6>
            {uncategorized.map((item) => (
              <div key={item.id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                <div className="flex-grow-1">
                  <div className="fw-medium">{item.name}</div>
                  {item.description && <small className="text-muted">{item.description}</small>}
                </div>
                <div className="fw-bold">{Number(item.price).toFixed(2)} €</div>
                <div className="d-flex gap-1">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingItem(item)}>
                    <i className="bi bi-pencil"></i>
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteItem(item.id)}>
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </>
  );
}

// ============================================================
// MODALS
// ============================================================

function CategoryModal({ category, onSave, onClose }: {
  category: Partial<Category>;
  onSave: (c: Partial<Category>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name || "");
  const [order, setOrder] = useState(category.displayOrder ?? 0);

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h6 className="modal-title">{category.id ? "Modifier" : "Ajouter"} une catégorie</h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label">Nom</label>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">Ordre d&apos;affichage</label>
              <input type="number" className="form-control" value={order} onChange={(e) => setOrder(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSave({ ...category, name, displayOrder: order })} disabled={!name.trim()}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemModal({ item, categories, onSave, onClose }: {
  item: Partial<Item>;
  categories: Category[];
  onSave: (i: Partial<Item>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: item.name || "",
    description: item.description || "",
    price: item.price ?? 0,
    categoryId: item.categoryId || categories[0]?.id || "",
    ingredients: (item.ingredients || []).join(", "),
    allergens: (item.allergens || []).join(", "),
    tags: (item.tags || []).join(", "),
    isAvailable: item.isAvailable ?? true,
  });

  const handleSubmit = () => {
    onSave({
      ...item,
      name: form.name,
      description: form.description || null,
      price: form.price,
      categoryId: form.categoryId || null,
      ingredients: form.ingredients.split(",").map((s) => s.trim()).filter(Boolean),
      allergens: form.allergens.split(",").map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      isAvailable: form.isAvailable,
    });
  };

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h6 className="modal-title">{item.id ? "Modifier" : "Ajouter"} un article</h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="row g-3">
              <div className="col-md-8">
                <label className="form-label">Nom</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Prix</label>
                <div className="input-group">
                  <input type="number" step="0.50" className="form-control" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
                  <span className="input-group-text">€</span>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Catégorie</label>
                <select className="form-select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Sans catégorie</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnel" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Ingrédients <small className="text-muted">(virgules)</small></label>
                <input className="form-control" value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} placeholder="tomate, mozzarella" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Allergènes <small className="text-muted">(virgules)</small></label>
                <input className="form-control" value={form.allergens} onChange={(e) => setForm({ ...form, allergens: e.target.value })} placeholder="gluten, lactose" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Tags <small className="text-muted">(virgules)</small></label>
                <input className="form-control" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="végétarien, épicé" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!form.name.trim()}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
