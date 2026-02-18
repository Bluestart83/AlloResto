"use client";

import { useState, useCallback, useMemo } from "react";
import { FoodIcon, detectFoodIcon } from "./FoodIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CartItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  ingredients?: string[];
  allergens?: string[];
  tags?: string[];
  options?: OptionGroup[];
  categoryId?: string | null;
}

interface OptionGroup {
  name: string;
  type: string;
  required?: boolean;
  source?: string;
  itemIds?: string[];
  choices?: OptionChoice[];
}

interface OptionChoice {
  label: string;
  price_modifier?: number;
}

interface CartCategory {
  id: string;
  name: string;
}

type OrderMode = "emporter" | "livraison";

interface OrderCartProps {
  categories: CartCategory[];
  items: CartItem[];
  currency: string;
  showMenuIcons: boolean;
  chatEnabled: boolean;
  phone?: string | null;
  deliveryEnabled: boolean;
  deliveryFee: number;
  deliveryFreeAbove: number | null;
  minOrderAmount: number;
}

interface SelectedOption {
  optionName: string;
  choiceLabel: string;
  priceModifier: number;
}

interface CartEntry {
  item: CartItem;
  selectedOptions: SelectedOption[];
  unitPrice: number;
  quantity: number;
  cartKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPrice(price: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(price);
}

function makeCartKey(itemId: string, selectedOptions: SelectedOption[]): string {
  if (selectedOptions.length === 0) return itemId;
  const parts = selectedOptions.map((o) => `${o.optionName}:${o.choiceLabel}`).join(",");
  return `${itemId}|${parts}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderCart({ categories, items, currency, showMenuIcons, chatEnabled, phone, deliveryEnabled, deliveryFee, deliveryFreeAbove, minOrderAmount }: OrderCartProps) {
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [optionModal, setOptionModal] = useState<CartItem | null>(null);
  const [modalSelections, setModalSelections] = useState<Record<string, { label: string; modifier: number }>>({});
  const [orderMode, setOrderMode] = useState<OrderMode>("emporter");

  // Item lookup by ID (for source: "items" options)
  const itemsById = useMemo(() => {
    const map = new Map<string, CartItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  // Category name lookup
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const map = new Map<string | null, CartItem[]>();
    for (const item of items) {
      const key = item.categoryId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const formules = itemsByCategory.get(null) || [];

  // -------------------------------------------------------------------------
  // Option helpers
  // -------------------------------------------------------------------------

  function resolveChoices(opt: OptionGroup): OptionChoice[] {
    if (opt.choices) return opt.choices;
    if (opt.source === "items" && opt.itemIds) {
      return opt.itemIds.map((id) => {
        const ref = itemsById.get(id);
        return { label: ref?.name || id, price_modifier: 0 };
      });
    }
    return [];
  }

  function hasOptions(item: CartItem): boolean {
    return !!item.options && item.options.length > 0;
  }

  function getDisplayPrice(item: CartItem): { price: number; isFrom: boolean } {
    const base = Number(item.price);
    if (base > 0 || !hasOptions(item)) return { price: base, isFrom: false };
    let min = Infinity;
    for (const opt of item.options!) {
      for (const c of resolveChoices(opt)) {
        if (c.price_modifier !== undefined && c.price_modifier > 0 && c.price_modifier < min) {
          min = c.price_modifier;
        }
      }
    }
    return min !== Infinity ? { price: min, isFrom: true } : { price: 0, isFrom: false };
  }

  // -------------------------------------------------------------------------
  // Cart actions
  // -------------------------------------------------------------------------

  function handleItemClick(item: CartItem) {
    if (hasOptions(item)) {
      setOptionModal(item);
      setModalSelections({});
    } else {
      addToCart(item, []);
    }
  }

  function addToCart(item: CartItem, selectedOptions: SelectedOption[]) {
    const cartKey = makeCartKey(item.id, selectedOptions);
    const modTotal = selectedOptions.reduce((s, o) => s + o.priceModifier, 0);
    const unitPrice = Number(item.price) + modTotal;
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(cartKey);
      if (existing) {
        next.set(cartKey, { ...existing, quantity: existing.quantity + 1 });
      } else {
        next.set(cartKey, { item, selectedOptions, unitPrice, quantity: 1, cartKey });
      }
      return next;
    });
  }

  function confirmOptions() {
    if (!optionModal) return;
    const opts = optionModal.options || [];
    for (const opt of opts) {
      if (opt.required && !modalSelections[opt.name]) return;
    }
    const selected: SelectedOption[] = Object.entries(modalSelections).map(([name, sel]) => ({
      optionName: name,
      choiceLabel: sel.label,
      priceModifier: sel.modifier,
    }));
    addToCart(optionModal, selected);
    setOptionModal(null);
  }

  const updateQty = useCallback((cartKey: string, delta: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      const entry = next.get(cartKey);
      if (!entry) return prev;
      const q = entry.quantity + delta;
      if (q <= 0) next.delete(cartKey);
      else next.set(cartKey, { ...entry, quantity: q });
      return next;
    });
  }, []);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(cartKey);
      return next;
    });
  }, []);

  const removeAllForItem = useCallback((itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key === itemId || key.startsWith(itemId + "|")) next.delete(key);
      }
      return next;
    });
  }, []);

  function getItemTotalQty(itemId: string): number {
    let total = 0;
    for (const [key] of cart) {
      if (key === itemId || key.startsWith(itemId + "|")) {
        total += cart.get(key)!.quantity;
      }
    }
    return total;
  }

  const cartEntries = Array.from(cart.values());
  const totalItems = cartEntries.reduce((s, e) => s + e.quantity, 0);
  const subtotal = cartEntries.reduce((s, e) => s + e.unitPrice * e.quantity, 0);

  // Delivery fee logic
  const isDelivery = orderMode === "livraison";
  const deliveryFreeApplied = isDelivery && deliveryFreeAbove !== null && subtotal >= deliveryFreeAbove;
  const appliedDeliveryFee = isDelivery && deliveryFee > 0 && !deliveryFreeApplied ? deliveryFee : 0;
  const totalPrice = subtotal + appliedDeliveryFee;
  const belowMinOrder = isDelivery && minOrderAmount > 0 && subtotal < minOrderAmount;

  const modalTotalModifier = Object.values(modalSelections).reduce((s, sel) => s + sel.modifier, 0);
  const modalUnitPrice = optionModal ? Number(optionModal.price) + modalTotalModifier : 0;
  const allRequiredSelected = optionModal
    ? (optionModal.options || []).every((opt) => !opt.required || !!modalSelections[opt.name])
    : false;

  // -------------------------------------------------------------------------
  // "Commander" button action
  // -------------------------------------------------------------------------

  function handleOrder() {
    const modeLabel = orderMode === "emporter" ? "à emporter" : "en livraison";
    const summary = cartEntries
      .map(({ item, selectedOptions, unitPrice, quantity }) => {
        let line = `${quantity}× ${item.name}`;
        if (selectedOptions.length > 0) {
          line += ` (${selectedOptions.map((o) => o.choiceLabel).join(", ")})`;
        }
        line += ` — ${fmtPrice(unitPrice * quantity, currency)}`;
        return line;
      })
      .join("\n");
    let msg = `Je souhaite commander (${modeLabel}) :\n${summary}`;
    if (appliedDeliveryFee > 0) {
      msg += `\nFrais de livraison : ${fmtPrice(appliedDeliveryFee, currency)}`;
    }
    if (deliveryFreeApplied) {
      msg += `\nFrais de livraison : offerts`;
    }
    msg += `\n\nTotal : ${fmtPrice(totalPrice, currency)}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SASChat = (window as any).SASChat;
    if (chatEnabled && SASChat) {
      if (typeof SASChat.send === "function") {
        SASChat.send(msg);
      } else {
        SASChat.open();
        window.dispatchEvent(new CustomEvent("sas-chat-send", { detail: { message: msg } }));
      }
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    }
  }

  // -------------------------------------------------------------------------
  // Render menu item card
  // -------------------------------------------------------------------------
  function renderItem(item: CartItem, isFormule = false) {
    const qty = getItemTotalQty(item.id);
    const dp = getDisplayPrice(item);
    const withOpts = hasOptions(item);
    const catName = item.categoryId ? categoryNameById.get(item.categoryId) : undefined;
    const iconName = showMenuIcons ? detectFoodIcon(item.name, catName, isFormule) : null;

    return (
      <div key={item.id} className="col-md-6">
        <div
          className={`public-menu-item${isFormule ? " public-menu-formule" : ""}${qty > 0 ? " public-menu-item-active" : ""}`}
          onClick={() => handleItemClick(item)}
          role="button"
        >
          {/* × remove — coin haut-droite */}
          {qty > 0 && (
            <button
              className="public-cart-corner-close"
              onClick={(e) => { e.stopPropagation(); removeAllForItem(item.id); }}
              aria-label="Supprimer"
            >×</button>
          )}

          <div className="d-flex align-items-start gap-2">
            {iconName && <FoodIcon name={iconName} />}
            <div className="flex-grow-1">
              <div className="fw-semibold">{item.name}</div>
              {item.description && (
                <div className="text-muted small">{item.description}</div>
              )}
              {!isFormule && item.ingredients && item.ingredients.length > 0 && (
                <div className="text-muted small fst-italic">
                  {item.ingredients.join(", ")}
                </div>
              )}
              {!isFormule && (
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {item.allergens && item.allergens.length > 0 && (
                    <span className="badge bg-warning bg-opacity-10 text-warning small">
                      <i className="bi bi-exclamation-triangle me-1" />
                      {item.allergens.join(", ")}
                    </span>
                  )}
                  {item.tags?.map((tag) => (
                    <span key={tag} className="badge bg-success bg-opacity-10 text-success small">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {withOpts && (
                <div className="mt-1 small text-muted fst-italic">
                  <i className="bi bi-sliders me-1" />
                  {item.options!.map((o) => o.name).join(", ")}
                </div>
              )}
            </div>
            <div className="d-flex flex-column align-items-center ms-auto flex-shrink-0 gap-1">
              <div className="text-center">
                {dp.isFrom && <div className="text-muted" style={{ fontSize: "0.65rem" }}>à partir de</div>}
                <span className="public-menu-price">{fmtPrice(dp.price, currency)}</span>
              </div>
              {qty > 0 && !withOpts && (
                <div className="public-cart-qty-bar" onClick={(e) => e.stopPropagation()}>
                  <button className="public-cart-btn" onClick={() => updateQty(item.id, -1)} aria-label="Retirer">−</button>
                  <span className="public-cart-badge-qty">{qty}</span>
                  <button className="public-cart-btn" onClick={() => updateQty(item.id, 1)} aria-label="Ajouter">+</button>
                </div>
              )}
              {qty > 0 && withOpts && (
                <div className="public-cart-qty-bar">
                  <span className="public-cart-badge-qty">{qty}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <div className="row">
        {/* Menu — left col */}
        <div className="col-lg-8">
          <h2 className="fw-bold mb-3 border-bottom pb-2">
            <i className="bi bi-book me-2" />Carte
          </h2>

          {categories.map((cat) => {
            const catItems = itemsByCategory.get(cat.id);
            if (!catItems?.length) return null;
            return (
              <div key={cat.id} className="mb-4">
                <h4 className="public-menu-category-title">{cat.name}</h4>
                <div className="row g-2">{catItems.map((item) => renderItem(item))}</div>
              </div>
            );
          })}

          {formules.length > 0 && (
            <div className="mb-4">
              <h4 className="public-menu-category-title">Formules & Menus</h4>
              <div className="row g-2">{formules.map((item) => renderItem(item, true))}</div>
            </div>
          )}
        </div>

        {/* Cart — right col */}
        <div className="col-lg-4">
          <div className="public-cart-panel">
            <h5 className="fw-bold mb-3">
              <i className="bi bi-cart3 me-2 public-icon" />
              Panier
              {totalItems > 0 && <span className="public-cart-count ms-2">{totalItems}</span>}
            </h5>

            {totalItems === 0 ? (
              <p className="text-muted small">Votre panier est vide</p>
            ) : (
              <>
                <div className="public-cart-items">
                  {cartEntries.map(({ item, selectedOptions, unitPrice, quantity, cartKey }) => (
                    <div key={cartKey} className="public-cart-line">
                      <div className="flex-grow-1">
                        <div className="fw-medium small">{item.name}</div>
                        {selectedOptions.length > 0 && (
                          <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                            {selectedOptions.map((o) => o.choiceLabel).join(", ")}
                          </div>
                        )}
                        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                          {fmtPrice(unitPrice, currency)} × {quantity}
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-bold small">{fmtPrice(unitPrice * quantity, currency)}</span>
                        <div className="public-cart-badge">
                          <button className="public-cart-btn" onClick={() => updateQty(cartKey, -1)}>−</button>
                          <span className="public-cart-badge-qty">{quantity}</span>
                          <button className="public-cart-btn" onClick={() => updateQty(cartKey, 1)}>+</button>
                        </div>
                        <button className="public-cart-btn public-cart-btn-remove" onClick={() => removeFromCart(cartKey)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mode toggle */}
                <div className="public-order-mode-toggle mt-2 mb-2">
                  <button
                    className={`public-order-mode-btn${orderMode === "emporter" ? " active" : ""}`}
                    onClick={() => setOrderMode("emporter")}
                  >
                    <i className="bi bi-bag me-1" />Emporter
                  </button>
                  {deliveryEnabled && (
                    <button
                      className={`public-order-mode-btn${orderMode === "livraison" ? " active" : ""}`}
                      onClick={() => setOrderMode("livraison")}
                    >
                      <i className="bi bi-truck me-1" />Livraison
                    </button>
                  )}
                </div>

                {/* Sous-total + frais de livraison */}
                <div className="public-cart-subtotal">
                  <div className="d-flex justify-content-between small">
                    <span>Sous-total</span>
                    <span>{fmtPrice(subtotal, currency)}</span>
                  </div>
                  {isDelivery && deliveryFee > 0 && (
                    <div className="d-flex justify-content-between small">
                      <span>Frais de livraison</span>
                      {deliveryFreeApplied ? (
                        <span className="text-success">
                          <s className="text-muted me-1">{fmtPrice(deliveryFee, currency)}</s>
                          Offerts
                        </span>
                      ) : (
                        <span>{fmtPrice(deliveryFee, currency)}</span>
                      )}
                    </div>
                  )}
                  {deliveryFreeApplied && (
                    <div className="d-flex justify-content-between small text-success">
                      <span>Réduction livraison</span>
                      <span>−{fmtPrice(deliveryFee, currency)}</span>
                    </div>
                  )}
                </div>

                <div className="public-cart-total">
                  <span className="fw-bold">Total</span>
                  <span className="fw-bold public-cart-total-price">{fmtPrice(totalPrice, currency)}</span>
                </div>

                {/* Warning minimum livraison */}
                {belowMinOrder && (
                  <div className="public-cart-warning small">
                    <i className="bi bi-exclamation-triangle me-1" />
                    Minimum de commande : {fmtPrice(minOrderAmount, currency)} pour la livraison
                  </div>
                )}

                {/* Bouton Commander */}
                <button
                  className="public-order-btn mt-3 w-100"
                  onClick={handleOrder}
                  disabled={belowMinOrder}
                >
                  <i className={`bi ${chatEnabled ? "bi-chat-dots" : "bi-telephone"} me-2`} />
                  Commander
                </button>
              </>
            )}

          </div>
        </div>
      </div>

      {/* ---- Option selection modal ---- */}
      {optionModal && (
        <div className="public-option-overlay" onClick={() => setOptionModal(null)}>
          <div className="public-option-modal" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h5 className="fw-bold mb-1">{optionModal.name}</h5>
                {optionModal.description && (
                  <p className="text-muted small mb-0">{optionModal.description}</p>
                )}
              </div>
              <button className="btn-close" onClick={() => setOptionModal(null)} />
            </div>

            {(optionModal.options || []).map((opt) => {
              const choices = resolveChoices(opt);
              return (
                <div key={opt.name} className="mb-3">
                  <div className="fw-semibold small mb-2">
                    {opt.name}
                    {opt.required && <span className="text-danger ms-1">*</span>}
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {choices.map((choice) => {
                      const isSelected = modalSelections[opt.name]?.label === choice.label;
                      const modifier = choice.price_modifier || 0;
                      return (
                        <label
                          key={choice.label}
                          className={`public-option-choice${isSelected ? " public-option-choice-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`opt-${opt.name}`}
                            checked={isSelected}
                            onChange={() =>
                              setModalSelections((prev) => ({
                                ...prev,
                                [opt.name]: { label: choice.label, modifier },
                              }))
                            }
                            className="form-check-input me-2"
                          />
                          <span className="flex-grow-1">{choice.label}</span>
                          {modifier > 0 && (
                            <span className="public-menu-price small">+{fmtPrice(modifier, currency)}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="d-flex justify-content-between align-items-center pt-3 border-top">
              <span className="fw-bold">{fmtPrice(modalUnitPrice, currency)}</span>
              <button
                className="btn btn-sm public-option-confirm"
                disabled={!allRequiredSelected}
                onClick={confirmOptions}
              >
                <i className="bi bi-cart-plus me-1" />Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
