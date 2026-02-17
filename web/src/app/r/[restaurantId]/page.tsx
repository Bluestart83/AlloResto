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
      {restaurant.coverImage && (
        <div className="public-hero">
          <img
            src={restaurant.coverImage}
            alt={restaurant.name}
            className="public-hero-img"
          />
        </div>
      )}

      <div className="container py-4">
        {/* Restaurant info */}
        <div className="mb-4">
          <h1 className="fw-bold mb-2">{restaurant.name}</h1>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            {restaurant.categories?.length > 0 ? (
              restaurant.categories.map((cat) => (
                <span key={cat} className="badge bg-primary bg-opacity-10 text-primary">
                  {capitalizeFirst(cat)}
                </span>
              ))
            ) : restaurant.cuisineType && restaurant.cuisineType !== "other" ? (
              <span className="badge bg-primary bg-opacity-10 text-primary">
                {capitalizeFirst(restaurant.cuisineType)}
              </span>
            ) : null}
            {restaurant.address && (
              <a href={mapsUrl(restaurant.address, restaurant.postalCode, restaurant.city)} target="_blank" rel="noopener noreferrer" className="text-muted small text-decoration-none">
                <i className="bi bi-geo-alt me-1" />
                {restaurant.address}{restaurant.postalCode ? `, ${restaurant.postalCode}` : ""} {restaurant.city || ""}
              </a>
            )}
          </div>
          {restaurant.description && (
            <p className="text-muted mb-0">{restaurant.description}</p>
          )}
        </div>

        {/* Info cards */}
        <div className="row g-3 mb-4">
          {/* Horaires */}
          {restaurant.openingHoursText?.length > 0 && (
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-2">
                    <i className="bi bi-clock me-2 text-primary" />Horaires
                  </h6>
                  <div className="small">
                    {restaurant.openingHoursText.map((line, i) => (
                      <div key={i}>{line}</div>
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
                  <i className="bi bi-telephone me-2 text-primary" />Contact
                </h6>
                <div className="small">
                  {restaurant.phone && <div><i className="bi bi-phone me-1" />{restaurant.phone}</div>}
                  {restaurant.website && (
                    <div>
                      <i className="bi bi-globe me-1" />
                      <a href={restaurant.website} target="_blank" rel="noopener noreferrer">
                        {restaurant.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </div>
                  )}
                  {restaurant.address && (
                    <div className="mt-1">
                      <i className="bi bi-geo-alt me-1" />
                      <a href={mapsUrl(restaurant.address, restaurant.postalCode, restaurant.city)} target="_blank" rel="noopener noreferrer">
                        {restaurant.address}{restaurant.postalCode ? `, ${restaurant.postalCode}` : ""} {restaurant.city || ""}
                      </a>
                    </div>
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
                    <i className="bi bi-truck me-2 text-primary" />Livraison
                  </h6>
                  <div className="small">
                    <div>Rayon : {restaurant.deliveryRadiusKm} km</div>
                    {Number(restaurant.minOrderAmount) > 0 && (
                      <div>Commande minimum : {formatPrice(Number(restaurant.minOrderAmount), currency)}</div>
                    )}
                    {Number(restaurant.deliveryFee) > 0 && (
                      <div>
                        Frais : {formatPrice(Number(restaurant.deliveryFee), currency)}
                        {restaurant.deliveryFreeAbove && (
                          <> (gratuit au-dessus de {formatPrice(Number(restaurant.deliveryFreeAbove), currency)})</>
                        )}
                      </div>
                    )}
                    <div>Preparation : ~{restaurant.avgPrepTimeMin} min</div>
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
