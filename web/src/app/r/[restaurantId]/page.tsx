import { getDb } from "@/lib/db";
import type { Restaurant } from "@/db/entities/Restaurant";
import type { MenuCategory } from "@/db/entities/MenuCategory";
import type { MenuItem } from "@/db/entities/MenuItem";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ restaurantId: string }>;
}

async function loadRestaurant(restaurantId: string) {
  const ds = await getDb();
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId, isActive: true });
  if (!restaurant) return null;

  const categories = await ds.getRepository<MenuCategory>("menu_categories").find({
    where: { restaurantId, isActive: true },
    order: { displayOrder: "ASC" },
  });

  const items = await ds.getRepository<MenuItem>("menu_items").find({
    where: { restaurantId, isAvailable: true },
    order: { displayOrder: "ASC" },
  });

  return { restaurant, categories, items };
}

// ---------------------------------------------------------------------------
// SEO Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { restaurantId } = await params;
  const data = await loadRestaurant(restaurantId);
  if (!data) return { title: "Restaurant introuvable" };

  const { restaurant } = data;
  const desc = restaurant.description || `Decouvrez la carte de ${restaurant.name}`;

  return {
    title: `${restaurant.name} — Menu et carte`,
    description: desc,
    openGraph: {
      title: restaurant.name,
      description: desc,
      images: restaurant.coverImage ? [restaurant.coverImage] : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(price);
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function mapsUrl(address: string, postalCode?: string | null, city?: string | null) {
  const full = [address, postalCode, city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_NAMES: Record<string, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
  thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
};

function formatOpeningHours(hours: Record<string, any>) {
  return DAY_ORDER.map((key) => {
    const day = DAY_NAMES[key];
    const slot = hours[key];
    if (!slot) return { day, hours: "Fermé" };
    let text = `${slot.open} – ${slot.close}`;
    if (slot.open2 && slot.close2) text += `, ${slot.open2} – ${slot.close2}`;
    return { day, hours: text };
  });
}

function formatPhone(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+33") && cleaned.length === 12) {
    const d = cleaned.slice(3);
    return `+33 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicRestaurantPage({ params }: PageProps) {
  const { restaurantId } = await params;
  const data = await loadRestaurant(restaurantId);
  if (!data) notFound();

  const { restaurant, categories, items } = data;
  const currency = restaurant.currency || "EUR";

  // Group items by category
  const itemsByCategory = new Map<string | null, typeof items>();
  for (const item of items) {
    const key = item.categoryId;
    if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
    itemsByCategory.get(key)!.push(item);
  }

  // Formules = items without category
  const formules = itemsByCategory.get(null) || [];

  return (
    <>
      {/* Hero / Cover */}
      <div className={`public-hero${restaurant.coverImage ? "" : " public-hero-plain"}`}>
        {restaurant.coverImage && (
          <img
            src={restaurant.coverImage}
            alt={restaurant.name}
            className="public-hero-img"
          />
        )}
        <div className="public-hero-content">
          <div className="container">
            <h1 className="public-hero-title">{restaurant.name}</h1>
            <div className="d-flex flex-wrap gap-2 mt-2">
              {restaurant.categories?.length > 0 ? (
                restaurant.categories.map((cat) => (
                  <span key={cat} className="public-hero-badge">
                    {capitalizeFirst(cat)}
                  </span>
                ))
              ) : restaurant.cuisineType && restaurant.cuisineType !== "other" ? (
                <span className="public-hero-badge">
                  {capitalizeFirst(restaurant.cuisineType)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="container py-4">
        {/* Description + quick links */}
        <div className="mb-4">
          {restaurant.description && (
            <p className="lead text-muted mb-2">{restaurant.description}</p>
          )}
          <div className="d-flex flex-wrap align-items-center gap-3">
            {restaurant.address && (
              <a href={mapsUrl(restaurant.address, restaurant.postalCode, restaurant.city)} target="_blank" rel="noopener noreferrer" className="public-quick-link">
                <i className="bi bi-geo-alt me-1" />
                {restaurant.address}{restaurant.postalCode ? `, ${restaurant.postalCode}` : ""} {restaurant.city || ""}
              </a>
            )}
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="public-quick-link">
                <i className="bi bi-telephone me-1" />
                {formatPhone(restaurant.phone)}
              </a>
            )}
            {restaurant.website && (
              <a href={restaurant.website} target="_blank" rel="noopener noreferrer" className="public-quick-link">
                <i className="bi bi-globe me-1" />
                {restaurant.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="row g-3 mb-4">
          {/* Horaires */}
          {restaurant.openingHours && Object.keys(restaurant.openingHours).length > 0 && (
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-2">
                    <i className="bi bi-clock me-2 public-icon" />Horaires
                  </h6>
                  <div className="small">
                    {formatOpeningHours(restaurant.openingHours).map(({ day, hours }) => (
                      <div key={day} className="d-flex justify-content-between py-1">
                        <span className="fw-medium">{day}</span>
                        <span className={hours === "Fermé" ? "text-muted fst-italic" : ""}>{hours}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact */}
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-body">
                <h6 className="fw-bold mb-2">
                  <i className="bi bi-telephone me-2 public-icon" />Contact
                </h6>
                <div className="small d-flex flex-column gap-1">
                  {restaurant.phone && (
                    <a href={`tel:${restaurant.phone}`} className="public-quick-link">
                      <i className="bi bi-phone me-1" />{formatPhone(restaurant.phone)}
                    </a>
                  )}
                  {restaurant.website && (
                    <a href={restaurant.website} target="_blank" rel="noopener noreferrer" className="public-quick-link">
                      <i className="bi bi-globe me-1" />{restaurant.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                  {restaurant.address && (
                    <a href={mapsUrl(restaurant.address, restaurant.postalCode, restaurant.city)} target="_blank" rel="noopener noreferrer" className="public-quick-link mt-1">
                      <i className="bi bi-geo-alt me-1" />{restaurant.address}{restaurant.postalCode ? `, ${restaurant.postalCode}` : ""} {restaurant.city || ""}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Livraison */}
          {restaurant.deliveryEnabled && (
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-2">
                    <i className="bi bi-truck me-2 public-icon" />Livraison
                  </h6>
                  <div className="small d-flex flex-column gap-2">
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-geo public-icon" />
                      <span>Rayon de <strong>{restaurant.deliveryRadiusKm} km</strong></span>
                    </div>
                    {Number(restaurant.minOrderAmount) > 0 && (
                      <div className="d-flex align-items-center gap-2">
                        <i className="bi bi-basket public-icon" />
                        <span>Minimum <strong>{formatPrice(Number(restaurant.minOrderAmount), currency)}</strong></span>
                      </div>
                    )}
                    {Number(restaurant.deliveryFee) > 0 && (
                      <div className="d-flex align-items-center gap-2">
                        <i className="bi bi-cash-coin public-icon" />
                        <span>
                          Frais <strong>{formatPrice(Number(restaurant.deliveryFee), currency)}</strong>
                          {restaurant.deliveryFreeAbove && (
                            <span className="text-success ms-1">(offerts dès {formatPrice(Number(restaurant.deliveryFreeAbove), currency)})</span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-stopwatch public-icon" />
                      <span>Préparation <strong>~{restaurant.avgPrepTimeMin} min</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Menu */}
        <h2 className="fw-bold mb-3 border-bottom pb-2">
          <i className="bi bi-book me-2" />Carte
        </h2>

        {categories.map((cat) => {
          const catItems = itemsByCategory.get(cat.id);
          if (!catItems?.length) return null;

          return (
            <div key={cat.id} className="mb-4">
              <h4 className="public-menu-category-title">{cat.name}</h4>
              <div className="row g-2">
                {catItems.map((item) => (
                  <div key={item.id} className="col-md-6">
                    <div className="public-menu-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <div className="fw-semibold">{item.name}</div>
                          {item.description && (
                            <div className="text-muted small">{item.description}</div>
                          )}
                          {item.ingredients?.length > 0 && (
                            <div className="text-muted small fst-italic">
                              {item.ingredients.join(", ")}
                            </div>
                          )}
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {item.allergens?.length > 0 && (
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
                          {/* Options */}
                          {item.options?.length > 0 && (
                            <div className="mt-1 small text-muted">
                              {item.options.map((opt: any, oi: number) => (
                                <div key={oi}>
                                  <span className="fw-medium">{opt.name}</span> :{" "}
                                  {opt.choices?.map((c: any) => (
                                    `${c.label}${c.price_modifier ? ` (+${formatPrice(c.price_modifier, currency)})` : ""}`
                                  )).join(", ")}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="public-menu-price ms-3">
                          {formatPrice(Number(item.price), currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Formules */}
        {formules.length > 0 && (
          <div className="mb-4">
            <h4 className="public-menu-category-title">Formules & Menus</h4>
            <div className="row g-2">
              {formules.map((item) => (
                <div key={item.id} className="col-md-6">
                  <div className="public-menu-item public-menu-formule">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-semibold">{item.name}</div>
                        {item.description && (
                          <div className="text-muted small">{item.description}</div>
                        )}
                      </div>
                      <div className="public-menu-price ms-3">
                        {formatPrice(Number(item.price), currency)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        {restaurant.gallery?.length > 0 && (
          <div className="mb-4">
            <h2 className="fw-bold mb-3 border-bottom pb-2">
              <i className="bi bi-images me-2" />Photos
            </h2>
            <div className="public-gallery">
              {restaurant.gallery.map((url, i) => (
                <img key={i} src={url} alt={`${restaurant.name} photo ${i + 1}`} className="public-gallery-img" />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
