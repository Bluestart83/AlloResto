/**
 * restaurant-import.service.ts
 * 
 * Service d'import automatique de restaurant :
 *   1. Google Places API → infos, photos, horaires, localisation
 *   2. OpenAI Vision    → scan photo menu → extraction items/prix
 *   3. Web Scrape + IA  → page web du resto → extraction menu
 *   4. Fusion           → JSON import format unifié
 * 
 * npm install openai sharp cheerio
 */

// ============================================================
// TYPES — Format d'import unifié
// ============================================================

export interface ImportedRestaurant {
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: { lat: number; lng: number; google_place_id: string | null };
  images: { logo: string | null; cover: string | null; gallery: string[] };
  opening_hours: Record<string, DayHours | null>;
  delivery: {
    enabled: boolean;
    radius_km: number;
    fee: number;
    free_above: number | null;
    min_order: number;
    avg_prep_time_min: number;
  };
  ai_config: {
    voice: string;
    language: string;
    welcome_message: string;
    instructions: string;
  };
}

export interface DayHours {
  open: string;
  close: string;
  open2?: string;
  close2?: string;
}

export interface MenuCategory {
  ref: string;
  name: string;
  description?: string;
  display_order: number;
  image?: string;
}

export interface MenuItemOption {
  name: string;
  type: "single_choice" | "multi_choice";
  required: boolean;
  max_choices?: number;
  choices: { label: string; price_modifier: number }[];
}

export interface MenuItemImport {
  ref: string;
  category_ref: string;
  name: string;
  description: string | null;
  price: number;
  image?: string;
  allergens: string[];
  tags: string[];
  available: boolean;
  options: MenuItemOption[];
}

export interface ImportResult {
  restaurant: ImportedRestaurant;
  menu: { categories: MenuCategory[]; items: MenuItemImport[] };
  _import_metadata: {
    source: string;
    imported_at: string;
    google_place_id: string | null;
    menu_source: "google_places" | "photo_scan" | "web_scrape" | "manual";
    confidence: number;
    needs_review: string[];
    raw_menu_photos?: string[];
  };
}

// ============================================================
// 1. GOOGLE PLACES — Import infos restaurant
// ============================================================

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

interface PlaceDetails {
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  geometry: { location: { lat: number; lng: number } };
  opening_hours?: {
    periods: { open: { day: number; time: string }; close?: { day: number; time: string } }[];
    weekday_text: string[];
  };
  photos?: { photo_reference: string; width: number; height: number }[];
  address_components: { long_name: string; short_name: string; types: string[] }[];
  place_id: string;
  rating?: number;
  price_level?: number;
}

/**
 * Cherche un restaurant sur Google Places par nom + ville
 */
export async function searchGooglePlace(
  query: string,
  city: string = ""
): Promise<{ place_id: string; name: string; address: string }[]> {
  const searchQuery = city ? `${query} ${city}` : query;
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", searchQuery);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "fr");
  url.searchParams.set("key", GOOGLE_API_KEY);

  const resp = await fetch(url.toString());
  const data = await resp.json();

  if (data.status !== "OK") return [];

  return data.results.slice(0, 5).map((r: any) => ({
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address,
  }));
}

/**
 * Récupère les détails complets d'un lieu Google Places
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const fields = [
    "name", "formatted_address", "formatted_phone_number", "website",
    "geometry", "opening_hours", "photos", "address_components",
    "place_id", "rating", "price_level",
  ].join(",");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", fields);
  url.searchParams.set("language", "fr");
  url.searchParams.set("key", GOOGLE_API_KEY);

  const resp = await fetch(url.toString());
  const data = await resp.json();

  if (data.status !== "OK") return null;
  return data.result;
}

/**
 * Télécharge une photo Google Places
 */
export function getPlacePhotoUrl(photoReference: string, maxWidth: number = 800): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

/**
 * Convertit les horaires Google Places en notre format
 */
function parseGoogleHours(
  periods: PlaceDetails["opening_hours"]["periods"]
): Record<string, DayHours | null> {
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const result: Record<string, DayHours | null> = {};

  for (const name of dayNames) {
    result[name] = null;
  }

  // Grouper les périodes par jour
  const grouped: Record<number, { open: string; close: string }[]> = {};
  for (const p of periods) {
    const day = p.open.day;
    if (!grouped[day]) grouped[day] = [];
    const openTime = `${p.open.time.slice(0, 2)}:${p.open.time.slice(2)}`;
    const closeTime = p.close
      ? `${p.close.time.slice(0, 2)}:${p.close.time.slice(2)}`
      : "23:59";
    grouped[day].push({ open: openTime, close: closeTime });
  }

  for (const [dayNum, slots] of Object.entries(grouped)) {
    const dayName = dayNames[parseInt(dayNum)];
    if (slots.length === 1) {
      result[dayName] = { open: slots[0].open, close: slots[0].close };
    } else if (slots.length >= 2) {
      // Coupure midi : 2 créneaux
      const sorted = slots.sort((a, b) => a.open.localeCompare(b.open));
      result[dayName] = {
        open: sorted[0].open,
        close: sorted[0].close,
        open2: sorted[1].open,
        close2: sorted[1].close,
      };
    }
  }

  return result;
}

/**
 * Extrait ville et code postal depuis address_components
 */
function extractAddressParts(components: PlaceDetails["address_components"]) {
  let city = "", postalCode = "", streetAddress = "";

  for (const c of components) {
    if (c.types.includes("locality")) city = c.long_name;
    if (c.types.includes("postal_code")) postalCode = c.long_name;
    if (c.types.includes("street_number") || c.types.includes("route")) {
      streetAddress += (streetAddress ? " " : "") + c.long_name;
    }
  }

  return { city, postalCode, streetAddress };
}

/**
 * Import complet depuis Google Places
 */
export async function importFromGooglePlaces(placeId: string): Promise<Partial<ImportResult>> {
  const details = await getPlaceDetails(placeId);
  if (!details) throw new Error(`Place not found: ${placeId}`);

  const { city, postalCode, streetAddress } = extractAddressParts(details.address_components);

  // Photos
  const gallery = (details.photos || []).map((p) => getPlacePhotoUrl(p.photo_reference));

  const restaurant: ImportedRestaurant = {
    name: details.name,
    address: streetAddress || details.formatted_address,
    city,
    postal_code: postalCode,
    country: "FR",
    phone: details.formatted_phone_number || null,
    email: null,
    website: details.website || null,
    location: {
      lat: details.geometry.location.lat,
      lng: details.geometry.location.lng,
      google_place_id: details.place_id,
    },
    images: {
      logo: null,
      cover: gallery[0] || null,
      gallery: gallery.slice(1),
    },
    opening_hours: details.opening_hours
      ? parseGoogleHours(details.opening_hours.periods)
      : {},
    delivery: {
      enabled: true,
      radius_km: 5.0,
      fee: 2.50,
      free_above: 25,
      min_order: 15,
      avg_prep_time_min: 30,
    },
    ai_config: {
      voice: "sage",
      language: "fr",
      welcome_message: `Bienvenue chez ${details.name} ! C'est pour une commande ou un renseignement ?`,
      instructions: `Tu es l'assistant vocal de ${details.name}. Sois chaleureux, efficace, et aide le client à passer sa commande.`,
    },
  };

  return {
    restaurant,
    _import_metadata: {
      source: "google_places",
      imported_at: new Date().toISOString(),
      google_place_id: placeId,
      menu_source: "google_places",
      confidence: 0.95,
      needs_review: ["delivery settings (defaults)", "menu not imported"],
    },
  };
}


// ============================================================
// 2. MENU SCAN — Photo → IA → Items structurés
// ============================================================

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MENU_EXTRACTION_PROMPT = `Tu es un expert en extraction de menus de restaurant.
Analyse cette photo de menu et extrais TOUS les éléments dans ce format JSON exact.

RÈGLES :
- Extrais chaque plat avec son nom exact, sa description si visible, et son prix
- Regroupe par catégorie visible sur le menu (pizzas, entrées, desserts, boissons...)
- Si un plat a des variantes de taille ou options, liste-les dans "options"
- Les prix doivent être des nombres (pas de texte)
- Si un prix n'est pas lisible, mets "price": null et ajoute dans needs_review
- Détecte les allergènes mentionnés
- Détecte les tags : végétarien, végan, épicé, maison, populaire/star

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks :
{
  "categories": [
    { "ref": "slug-unique", "name": "Nom Catégorie", "display_order": 0 }
  ],
  "items": [
    {
      "ref": "slug-unique",
      "category_ref": "slug-categorie",
      "name": "Nom du plat",
      "description": "Description ou null",
      "price": 12.50,
      "allergens": ["gluten", "lactose"],
      "tags": ["végétarien"],
      "options": [
        {
          "name": "Taille",
          "type": "single_choice",
          "required": true,
          "choices": [
            { "label": "Normale", "price_modifier": 0 },
            { "label": "Grande", "price_modifier": 3.00 }
          ]
        }
      ]
    }
  ],
  "needs_review": ["items where price was unclear"],
  "confidence": 0.85
}`;

/**
 * Extrait un menu depuis une ou plusieurs photos
 * Accepte : URLs, base64, ou chemins de fichiers (Buffer)
 */
export async function extractMenuFromPhotos(
  images: { url?: string; base64?: string; mimeType?: string }[]
): Promise<{ categories: MenuCategory[]; items: MenuItemImport[]; confidence: number; needs_review: string[] }> {

  // Construire le message avec toutes les images
  const content: any[] = [{ type: "text", text: MENU_EXTRACTION_PROMPT }];

  for (const img of images) {
    if (img.url) {
      content.push({ type: "image_url", image_url: { url: img.url, detail: "high" } });
    } else if (img.base64) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType || "image/jpeg"};base64,${img.base64}`,
          detail: "high",
        },
      });
    }
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content }],
    max_tokens: 4096,
    temperature: 0.1, // Basse pour extraction factuelle
  });

  const raw = response.choices[0].message.content || "{}";

  // Parse JSON (nettoyer les backticks si présents)
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Normaliser les items
  const items: MenuItemImport[] = (parsed.items || []).map((item: any) => ({
    ref: item.ref || slugify(item.name),
    category_ref: item.category_ref,
    name: item.name,
    description: item.description || null,
    price: item.price ?? 0,
    allergens: item.allergens || [],
    tags: item.tags || [],
    available: true,
    options: (item.options || []).map((opt: any) => ({
      name: opt.name,
      type: opt.type || "single_choice",
      required: opt.required ?? false,
      choices: opt.choices || [],
    })),
  }));

  const categories: MenuCategory[] = (parsed.categories || []).map((cat: any, i: number) => ({
    ref: cat.ref || slugify(cat.name),
    name: cat.name,
    description: cat.description,
    display_order: cat.display_order ?? i,
  }));

  return {
    categories,
    items,
    confidence: parsed.confidence ?? 0.8,
    needs_review: parsed.needs_review || [],
  };
}


// ============================================================
// 3. WEB SCRAPE — Page web du resto → Menu
// ============================================================

const MENU_SCRAPE_PROMPT = `Tu es un expert en extraction de données de restaurants.
Voici le contenu HTML/texte d'une page de restaurant. Extrais le menu complet.

RÈGLES :
- Extrais chaque plat avec nom, description, prix
- Regroupe par catégorie
- Si des tailles ou options sont mentionnées, structure-les
- Identifie les allergènes et tags si mentionnés
- Prix en nombres (pas de symboles)

Réponds UNIQUEMENT en JSON valide (même format que pour le scan photo) :
{
  "categories": [...],
  "items": [...],
  "needs_review": [...],
  "confidence": 0.85
}`;

/**
 * Scrape une page web et extrait le menu via IA
 */
export async function extractMenuFromWebsite(websiteUrl: string): Promise<{
  categories: MenuCategory[];
  items: MenuItemImport[];
  confidence: number;
  needs_review: string[];
}> {
  // 1. Fetch la page
  const resp = await fetch(websiteUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; VoiceOrderBot/1.0)",
      "Accept": "text/html",
    },
  });

  if (!resp.ok) throw new Error(`Failed to fetch ${websiteUrl}: ${resp.status}`);
  const html = await resp.text();

  // 2. Extraire le texte utile (sans balises)
  const textContent = stripHtml(html);

  // 3. Limiter la taille (GPT-4o context)
  const truncated = textContent.slice(0, 12000);

  // 4. Envoyer à l'IA
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "user", content: `${MENU_SCRAPE_PROMPT}\n\n---\nCONTENU DE LA PAGE :\n${truncated}` },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const raw = response.choices[0].message.content || "{}";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const items: MenuItemImport[] = (parsed.items || []).map((item: any) => ({
    ref: item.ref || slugify(item.name),
    category_ref: item.category_ref,
    name: item.name,
    description: item.description || null,
    price: item.price ?? 0,
    allergens: item.allergens || [],
    tags: item.tags || [],
    available: true,
    options: (item.options || []).map((opt: any) => ({
      name: opt.name,
      type: opt.type || "single_choice",
      required: opt.required ?? false,
      choices: opt.choices || [],
    })),
  }));

  const categories: MenuCategory[] = (parsed.categories || []).map((cat: any, i: number) => ({
    ref: cat.ref || slugify(cat.name),
    name: cat.name,
    description: cat.description,
    display_order: cat.display_order ?? i,
  }));

  return {
    categories,
    items,
    confidence: parsed.confidence ?? 0.7,
    needs_review: [...(parsed.needs_review || []), "extracted from website - verify prices"],
  };
}


// ============================================================
// 4. IMPORT COMPLET — Combine tout
// ============================================================

export type ImportSource =
  | { type: "google_places"; placeId: string }
  | { type: "menu_photos"; images: { url?: string; base64?: string; mimeType?: string }[] }
  | { type: "website"; url: string }
  | { type: "json"; data: ImportResult };

/**
 * Pipeline d'import complet
 * 
 * Exemples d'usage :
 * 
 *   // Import tout depuis Google Places + scan photo du menu
 *   const result = await importRestaurant([
 *     { type: "google_places", placeId: "ChIJ..." },
 *     { type: "menu_photos", images: [{ base64: "..." }] },
 *   ]);
 * 
 *   // Import depuis site web uniquement
 *   const result = await importRestaurant([
 *     { type: "google_places", placeId: "ChIJ..." },
 *     { type: "website", url: "https://bellanapoli.fr/menu" },
 *   ]);
 * 
 *   // Import JSON brut (copier-coller)
 *   const result = await importRestaurant([
 *     { type: "json", data: jsonObject },
 *   ]);
 */
export async function importRestaurant(sources: ImportSource[]): Promise<ImportResult> {
  let result: Partial<ImportResult> = {
    menu: { categories: [], items: [] },
    _import_metadata: {
      source: "",
      imported_at: new Date().toISOString(),
      google_place_id: null,
      menu_source: "manual",
      confidence: 0,
      needs_review: [],
    },
  };

  const sourcesUsed: string[] = [];
  const allNeedsReview: string[] = [];

  for (const source of sources) {
    switch (source.type) {
      case "google_places": {
        const gp = await importFromGooglePlaces(source.placeId);
        result.restaurant = gp.restaurant;
        result._import_metadata!.google_place_id = source.placeId;
        sourcesUsed.push("google_places");
        allNeedsReview.push(...(gp._import_metadata?.needs_review || []));
        break;
      }

      case "menu_photos": {
        const menu = await extractMenuFromPhotos(source.images);
        result.menu = { categories: menu.categories, items: menu.items };
        result._import_metadata!.menu_source = "photo_scan";
        result._import_metadata!.confidence = menu.confidence;
        sourcesUsed.push("menu_scan");
        allNeedsReview.push(...menu.needs_review);
        break;
      }

      case "website": {
        const menu = await extractMenuFromWebsite(source.url);
        // Ne remplace le menu que s'il n'a pas déjà été importé (photo prioritaire)
        if (result.menu!.items.length === 0) {
          result.menu = { categories: menu.categories, items: menu.items };
          result._import_metadata!.menu_source = "web_scrape";
          result._import_metadata!.confidence = menu.confidence;
        }
        sourcesUsed.push("web_scrape");
        allNeedsReview.push(...menu.needs_review);
        break;
      }

      case "json": {
        result = source.data;
        sourcesUsed.push("json_import");
        break;
      }
    }
  }

  result._import_metadata!.source = sourcesUsed.join("+");
  result._import_metadata!.needs_review = [...new Set(allNeedsReview)];

  // Fallback : si pas de restaurant info, créer un squelette
  if (!result.restaurant) {
    result.restaurant = {
      name: "Restaurant à configurer",
      address: "",
      city: "",
      postal_code: "",
      country: "FR",
      phone: null,
      email: null,
      website: null,
      location: { lat: 0, lng: 0, google_place_id: null },
      images: { logo: null, cover: null, gallery: [] },
      opening_hours: {},
      delivery: {
        enabled: false,
        radius_km: 5,
        fee: 0,
        free_above: null,
        min_order: 0,
        avg_prep_time_min: 30,
      },
      ai_config: {
        voice: "sage",
        language: "fr",
        welcome_message: "Bienvenue ! C'est pour une commande ?",
        instructions: "",
      },
    };
  }

  return result as ImportResult;
}


// ============================================================
// 5. PERSIST — Sauvegarde en BDD via TypeORM
// ============================================================

import { AppDataSource } from "./data-source";
import { Restaurant } from "./entities/Restaurant";
import { MenuCategory as MenuCategoryEntity } from "./entities/MenuCategory";
import { MenuItem as MenuItemEntity } from "./entities/MenuItem";

/**
 * Sauvegarde un ImportResult complet en base
 */
export async function persistImport(data: ImportResult): Promise<string> {
  const ds = AppDataSource;
  const r = data.restaurant;

  // 1. Créer le restaurant
  const restaurant = ds.getRepository(Restaurant).create({
    name: r.name,
    address: r.address,
    city: r.city,
    postalCode: r.postal_code,
    phone: r.phone,
    contactEmail: r.email,
    lat: r.location.lat || undefined,
    lng: r.location.lng || undefined,
    welcomeMessage: r.ai_config.welcome_message,
    aiVoice: r.ai_config.voice,
    aiInstructions: r.ai_config.instructions,
    deliveryEnabled: r.delivery.enabled,
    deliveryRadiusKm: r.delivery.radius_km,
    deliveryFee: r.delivery.fee,
    minOrderAmount: r.delivery.min_order,
    avgPrepTimeMin: r.delivery.avg_prep_time_min,
    openingHours: r.opening_hours,
  });

  const savedRestaurant = await ds.getRepository(Restaurant).save(restaurant);

  // 2. Créer les catégories (mapping ref → id)
  const categoryMap: Record<string, string> = {};

  for (const cat of data.menu.categories) {
    const entity = ds.getRepository(MenuCategoryEntity).create({
      restaurantId: savedRestaurant.id,
      name: cat.name,
      displayOrder: cat.display_order,
    });
    const saved = await ds.getRepository(MenuCategoryEntity).save(entity);
    categoryMap[cat.ref] = saved.id;
  }

  // 3. Créer les items
  for (const item of data.menu.items) {
    const entity = ds.getRepository(MenuItemEntity).create({
      restaurantId: savedRestaurant.id,
      categoryId: categoryMap[item.category_ref] || null,
      name: item.name,
      description: item.description,
      price: item.price,
      allergens: item.allergens,
      tags: item.tags,
      isAvailable: item.available,
      options: item.options,
    });
    await ds.getRepository(MenuItemEntity).save(entity);
  }

  return savedRestaurant.id;
}


// ============================================================
// UTILS
// ============================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function stripHtml(html: string): string {
  // Supprime scripts, styles, puis balises
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
