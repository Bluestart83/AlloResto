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
  cuisine_type: string;
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
  opening_hours_text: string[];
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
  ingredients: string[];
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
    google_place_raw?: Record<string, any>;
    serpapi_photos_raw?: Record<string, any>;
  };
}

// ============================================================
// 1. GOOGLE PLACES — Import infos restaurant
// ============================================================

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
console.log(`[env] GOOGLE_MAPS_API_KEY=${GOOGLE_API_KEY ? GOOGLE_API_KEY.slice(0, 10) + "..." : "MISSING"}`);
console.log(`[env] SERPAPI_KEY=${SERPAPI_KEY ? "configured" : "not set (menu photos via SerpApi disabled)"}`);

interface PlaceDetails {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
  types?: string[];
  location: { latitude: number; longitude: number };
  regularOpeningHours?: {
    periods: { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
    weekdayDescriptions: string[];
  };
  addressComponents: { longText: string; shortText: string; types: string[] }[];
}

/** Maps Google Places types to our cuisine types */
const GOOGLE_TYPE_TO_CUISINE: Record<string, string> = {
  italian_restaurant: "italien",
  pizza_restaurant: "pizza",
  chinese_restaurant: "chinois",
  indian_restaurant: "indien",
  japanese_restaurant: "japonais",
  sushi_restaurant: "sushi",
  thai_restaurant: "thai",
  korean_restaurant: "coreen",
  vietnamese_restaurant: "vietnamien",
  mexican_restaurant: "mexicain",
  lebanese_restaurant: "libanais",
  turkish_restaurant: "turc",
  greek_restaurant: "grec",
  french_restaurant: "francais",
  hamburger_restaurant: "burger",
  fast_food_restaurant: "fast_food",
  kebab_shop: "kebab",
};

function detectCuisineType(details: PlaceDetails): string {
  if (details.primaryType && GOOGLE_TYPE_TO_CUISINE[details.primaryType]) {
    return GOOGLE_TYPE_TO_CUISINE[details.primaryType];
  }
  for (const t of details.types || []) {
    if (GOOGLE_TYPE_TO_CUISINE[t]) return GOOGLE_TYPE_TO_CUISINE[t];
  }
  return "other";
}

/**
 * Cherche un restaurant sur Google Places par nom + ville
 */
export async function searchGooglePlace(
  query: string,
  city: string = ""
): Promise<{ place_id: string; name: string; address: string }[]> {
  const textQuery = city ? `${query} ${city}` : query;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery, includedType: "restaurant", languageCode: "fr" }),
  });

  if (!resp.ok) return [];
  const data = await resp.json();

  return (data.places || []).slice(0, 5).map((r: any) => ({
    place_id: r.id,
    name: r.displayName?.text || "",
    address: r.formattedAddress || "",
  }));
}

/**
 * Autocomplete Google Places — suggestions en temps réel
 */
export async function autocompletePlaces(
  input: string
): Promise<{ place_id: string; main_text: string; secondary_text: string }[]> {
  console.log(`[autocomplete] input="${input}"`);
  if (!input || input.length < 2) return [];

  const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
    },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: ["restaurant", "cafe", "bar", "food"],
      languageCode: "fr",
    }),
  });

  if (!resp.ok) {
    console.log(`[autocomplete] error ${resp.status}`);
    return [];
  }

  const data = await resp.json();
  const suggestions = (data.suggestions || [])
    .filter((s: any) => s.placePrediction)
    .slice(0, 6);

  console.log(`[autocomplete] ${suggestions.length} suggestions`);

  const results = suggestions.map((s: any) => ({
    place_id: s.placePrediction.placeId,
    main_text: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || "",
    secondary_text: s.placePrediction.structuredFormat?.secondaryText?.text || "",
  }));
  console.log(`[autocomplete] results:`, results.map((r: any) => r.main_text));
  return results;
}

/**
 * Extrait un place_id à partir d'une URL Google Maps
 * Supporte les formats :
 *  - https://maps.google.com/?cid=...
 *  - https://www.google.com/maps/place/...
 *  - https://goo.gl/maps/...
 */
export async function findPlaceFromGoogleMapsUrl(
  url: string
): Promise<string | null> {
  // Essaie d'extraire le nom du lieu depuis l'URL pour chercher via Text Search
  const placeMatch = url.match(/\/maps\/place\/([^/?]+)/);
  const textQuery = placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g, " ")) : url;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery, languageCode: "fr" }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();

  if (data.places?.length > 0) {
    return data.places[0].id;
  }
  return null;
}

/**
 * Récupère les détails complets d'un lieu Google Places (API v1)
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const fieldMask = [
    "id", "displayName", "formattedAddress", "nationalPhoneNumber",
    "websiteUri", "location", "regularOpeningHours", "addressComponents",
    "primaryType", "types",
  ].join(",");

  const resp = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=fr`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": fieldMask,
      },
    }
  );

  if (!resp.ok) return null;
  return resp.json();
}

/**
 * Récupère les photos d'un lieu via la nouvelle API Places (v1)
 * GET https://places.googleapis.com/v1/places/{PLACE_ID}
 * Headers: X-Goog-Api-Key + X-Goog-FieldMask: photos
 */
export async function fetchPlacePhotos(placeId: string): Promise<{ name: string; widthPx: number; heightPx: number }[]> {
  const resp = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "photos",
    },
  });

  if (!resp.ok) {
    console.error(`[fetchPlacePhotos] error ${resp.status}:`, await resp.text());
    return [];
  }

  const data = await resp.json();
  return data.photos || [];
}

/**
 * Construit l'URL media d'une photo Places (v1)
 * Le `name` est au format "places/{PLACE_ID}/photos/{PHOTO_REF}"
 */
export function getPlacePhotoUrl(photoName: string, maxWidth: number = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_API_KEY}`;
}

// ============================================================
// 1b. SERPAPI — Photos menu catégorisées
// ============================================================

/**
 * Récupère le data_id SerpApi depuis un nom + adresse de restaurant
 * (nécessaire pour l'API google_maps_photos)
 */
async function fetchSerpApiDataId(placeName: string, address: string): Promise<string | null> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", `${placeName} ${address}`);
  url.searchParams.set("google_domain", "google.fr");
  url.searchParams.set("hl", "fr");
  url.searchParams.set("api_key", SERPAPI_KEY);

  console.log(`[serpapi] searching data_id for "${placeName} ${address}"`);
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    console.error(`[serpapi] search error ${resp.status}`);
    return null;
  }

  const data = await resp.json();
  const firstResult = data.local_results?.[0] || data.place_results;
  if (!firstResult?.data_id) {
    console.log(`[serpapi] no data_id found`);
    return null;
  }

  console.log(`[serpapi] data_id=${firstResult.data_id}`);
  return firstResult.data_id;
}

/**
 * Récupère les photos "Menu" via SerpApi Google Maps Photos
 * Étape 1 : GET sans category_id → récupère les catégories dispo
 * Étape 2 : GET avec category_id "Menu" → photos de menu
 */
export async function fetchMenuPhotosViaSerpApi(
  dataId: string
): Promise<{ url: string; title?: string }[]> {
  // Étape 1 : récupérer les catégories pour trouver l'id "Menu"
  const catUrl = new URL("https://serpapi.com/search.json");
  catUrl.searchParams.set("engine", "google_maps_photos");
  catUrl.searchParams.set("data_id", dataId);
  catUrl.searchParams.set("api_key", SERPAPI_KEY);

  console.log(`[serpapi] fetching photo categories for data_id=${dataId}`);
  const catResp = await fetch(catUrl.toString());
  if (!catResp.ok) {
    console.error(`[serpapi] photos error ${catResp.status}`);
    return [];
  }

  const catData = await catResp.json();
  const menuCategory = (catData.categories || []).find(
    (c: any) => c.title?.toLowerCase() === "menu"
  );

  if (!menuCategory) {
    console.log(`[serpapi] no "Menu" category found, available: ${(catData.categories || []).map((c: any) => c.title).join(", ")}`);
    return [];
  }

  // Étape 2 : récupérer les photos filtrées par catégorie "Menu"
  const photoUrl = new URL("https://serpapi.com/search.json");
  photoUrl.searchParams.set("engine", "google_maps_photos");
  photoUrl.searchParams.set("data_id", dataId);
  photoUrl.searchParams.set("category_id", menuCategory.id);
  photoUrl.searchParams.set("api_key", SERPAPI_KEY);

  console.log(`[serpapi] fetching menu photos (category_id=${menuCategory.id})`);
  const photoResp = await fetch(photoUrl.toString());
  if (!photoResp.ok) {
    console.error(`[serpapi] menu photos error ${photoResp.status}`);
    return [];
  }

  const photoData = await photoResp.json();
  const photos = (photoData.photos || []).map((p: any) => ({
    url: p.image as string,
    title: p.title,
  }));

  console.log(`[serpapi] found ${photos.length} menu photos`);
  return photos;
}

/**
 * Convertit les horaires Google Places (API v1) en notre format
 */
function parseGoogleHours(
  periods: NonNullable<PlaceDetails["regularOpeningHours"]>["periods"]
): Record<string, DayHours | null> {
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const result: Record<string, DayHours | null> = {};

  for (const name of dayNames) {
    result[name] = null;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  // Grouper les périodes par jour
  const grouped: Record<number, { open: string; close: string }[]> = {};
  for (const p of periods) {
    const day = p.open.day;
    if (!grouped[day]) grouped[day] = [];
    const openTime = `${pad(p.open.hour)}:${pad(p.open.minute)}`;
    const closeTime = p.close
      ? `${pad(p.close.hour)}:${pad(p.close.minute)}`
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
 * Extrait ville et code postal depuis addressComponents (API v1)
 */
function extractAddressParts(components: PlaceDetails["addressComponents"]) {
  let city = "", postalCode = "", streetAddress = "";

  for (const c of components) {
    if (c.types.includes("locality")) city = c.longText;
    if (c.types.includes("postal_code")) postalCode = c.longText;
    if (c.types.includes("street_number") || c.types.includes("route")) {
      streetAddress += (streetAddress ? " " : "") + c.longText;
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

  console.log(`\n====== GOOGLE PLACES RAW DETAILS ======`);
  console.log(JSON.stringify(details, null, 2));
  console.log(`======================================\n`);

  const { city, postalCode, streetAddress } = extractAddressParts(details.addressComponents);

  // Photos via nouvelle API Places v1
  const placePhotos = await fetchPlacePhotos(placeId);
  const gallery = placePhotos.map((p) => getPlacePhotoUrl(p.name));

  const restaurant: ImportedRestaurant = {
    name: details.displayName.text,
    cuisine_type: detectCuisineType(details),
    address: streetAddress || details.formattedAddress,
    city,
    postal_code: postalCode,
    country: "FR",
    phone: details.nationalPhoneNumber || null,
    email: null,
    website: details.websiteUri || null,
    location: {
      lat: details.location.latitude,
      lng: details.location.longitude,
      google_place_id: details.id,
    },
    images: {
      logo: null,
      cover: gallery[0] || null,
      gallery: gallery.slice(1),
    },
    opening_hours: details.regularOpeningHours
      ? parseGoogleHours(details.regularOpeningHours.periods)
      : {},
    opening_hours_text: details.regularOpeningHours?.weekdayDescriptions || [],
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
      welcome_message: `Bienvenue chez ${details.displayName.text} ! C'est pour une commande ou un renseignement ?`,
      instructions: `Tu es l'assistant vocal de ${details.displayName.text}. Sois chaleureux, efficace, et aide le client à passer sa commande.`,
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
      google_place_raw: details as unknown as Record<string, any>,
    },
  };
}

/**
 * Récupère les photos de menu via SerpApi (appelé séparément, au step "import menu")
 * Retourne les URLs + les données brutes SerpApi pour stockage
 */
export async function fetchMenuPhotos(
  placeName: string,
  address: string
): Promise<{ photos: string[]; serpapi_raw: Record<string, any> | null }> {
  if (!SERPAPI_KEY) return { photos: [], serpapi_raw: null };

  const dataId = await fetchSerpApiDataId(placeName, address);
  if (!dataId) return { photos: [], serpapi_raw: null };

  const photos = await fetchMenuPhotosViaSerpApi(dataId);
  return {
    photos: photos.map((p) => p.url),
    serpapi_raw: { data_id: dataId, photos },
  };
}


// ============================================================
// 2. MENU SCAN — Photo → IA → Items structurés
// ============================================================

import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const DEFAULT_CATEGORIES = [
  { ref: "entrees", name: "Entrées", display_order: 0 },
  { ref: "plats", name: "Plats", display_order: 1 },
  { ref: "desserts", name: "Desserts", display_order: 2 },
  { ref: "boissons", name: "Boissons", display_order: 3 },
  { ref: "boissons-chaudes", name: "Boissons chaudes", display_order: 4 },
];

const MENU_EXTRACTION_PROMPT = `Tu es un expert en extraction de menus de restaurant.
Analyse ces photos de menu et extrais TOUS les éléments dans le format JSON ci-dessous.

IMPORTANT : Extrais UNIQUEMENT ce qui est visible sur les photos. Si un champ n'est pas lisible ou absent, mets null ou un tableau vide. Ne rajoute pas de descriptions imaginaires. EXCEPTION pour ingrédients et allergènes : tu PEUX déduire l'ingrédient principal et les allergènes évidents à partir du nom du plat.

CATÉGORIES PAR DÉFAUT (utilise ces refs exactes) :
- "entrees" → Entrées
- "plats" → Plats
- "desserts" → Desserts
- "boissons" → Boissons
- "boissons-chaudes" → Boissons chaudes
Tu peux ajouter des sous-catégories si le menu en montre (ex: "pizzas", "pates", "salades"), mais mappe les items aux catégories standard en priorité.

RÈGLES IMPORTANTES :
1. DOUBLONS : Si un plat apparaît plusieurs fois, ne le garde qu'UNE SEULE FOIS. GARDE LE PRIX LE PLUS ÉLEVÉ.
2. FORMULES : Repère les menus et formules (ex: "Menu Midi 15€ = entrée + plat + dessert", "Formule Express", "Menu Enfant"). Les formules n'ont PAS de category_ref (mets null). Pour chaque formule, décris les groupes de choix dans "options" en RÉFÉRENÇANT les catégories par leur ref. Utilise source:"category" + category_ref pour un choix parmi une catégorie entière. Utilise source:"items" + item_refs pour un choix parmi des items spécifiques ou un item fixe (ex: item_refs:["cafe"] pour imposer un café).
3. CATÉGORIES : Regroupe par catégorie visible sur le menu. Utilise les refs standard ci-dessus.
   ATTENTION PLATEFORMES DE LIVRAISON : Si les données proviennent d'Uber Eats, Deliveroo, etc., NE crée PAS une catégorie par plat ! Regroupe intelligemment.
4. OPTIONS / VARIANTES : Pour un plat (non-formule) avec variantes (taille, sauce), structure-les avec "choices" (label + price_modifier).
5. PRIX : Toujours en nombre décimal (12.50). Si absent → null + needs_review.
6. TAGS : Détecte végétarien, végan, épicé, sans gluten, maison, populaire, nouveau.
7. INGRÉDIENTS : Déduis l'ingrédient principal du nom si rien n'est listé.
8. DESCRIPTION : Si visible, sinon null.
9. ALLERGÈNES : Déduis des ingrédients (14 allergènes officiels UE).
10. REF : Slug unique (ex: "pizza-margherita", "menu-midi").

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks :
{
  "categories": [
    { "ref": "entrees", "name": "Entrées", "display_order": 0 },
    { "ref": "plats", "name": "Plats", "display_order": 1 },
    { "ref": "desserts", "name": "Desserts", "display_order": 2 },
    { "ref": "boissons", "name": "Boissons", "display_order": 3 },
    { "ref": "boissons-chaudes", "name": "Boissons chaudes", "display_order": 4 }
  ],
  "items": [
    {
      "ref": "salade-cesar",
      "category_ref": "entrees",
      "name": "Salade César",
      "description": "Notre salade signature",
      "ingredients": ["laitue romaine", "parmesan", "croûtons", "sauce César"],
      "price": 9.50,
      "allergens": ["gluten", "lactose"],
      "tags": [],
      "options": []
    },
    {
      "ref": "pizza-margherita",
      "category_ref": "plats",
      "name": "Pizza Margherita",
      "description": null,
      "ingredients": ["tomate", "mozzarella", "basilic"],
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
    },
    {
      "ref": "menu-midi",
      "category_ref": null,
      "name": "Menu Midi",
      "description": "Entrée + Plat + Dessert",
      "ingredients": [],
      "price": 18.90,
      "allergens": [],
      "tags": [],
      "options": [
        {
          "name": "Entrée au choix",
          "type": "single_choice",
          "required": true,
          "source": "category",
          "category_ref": "entrees",
          "max_price": null
        },
        {
          "name": "Plat au choix",
          "type": "single_choice",
          "required": true,
          "source": "category",
          "category_ref": "plats",
          "max_price": null
        },
        {
          "name": "Dessert au choix",
          "type": "single_choice",
          "required": true,
          "source": "category",
          "category_ref": "desserts",
          "max_price": null
        },
        {
          "name": "Boisson chaude",
          "type": "single_choice",
          "required": true,
          "source": "items",
          "item_refs": ["cafe"],
          "max_price": null
        }
      ]
    }
  ],
  "needs_review": [],
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

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content }],
    max_tokens: 16384,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const finishReason = response.choices[0].finish_reason;

  console.log(`\n====== MENU SCAN — OpenAI Response ======`);
  console.log(`finish_reason=${finishReason}, raw length=${raw.length}`);
  console.log(raw);
  console.log(`==========================================\n`);
  if (finishReason === "length") {
    console.warn(`[menu-scan] Response truncated by max_tokens!`);
  }

  // Parse JSON (nettoyer les backticks si présents)
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = safeParseJSON(cleaned);

  // Normaliser les items
  const rawItems: MenuItemImport[] = (parsed.items || []).map(normalizeImportItem);

  // Déduplication par nom normalisé (safety net)
  const items = deduplicateItems(rawItems);

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

IMPORTANT : Extrais UNIQUEMENT ce qui est présent dans le contenu. Si un champ n'est pas mentionné, mets null ou []. EXCEPTION : déduis l'ingrédient principal et les allergènes évidents du nom du plat.

CATÉGORIES PAR DÉFAUT (utilise ces refs exactes) :
- "entrees" → Entrées
- "plats" → Plats
- "desserts" → Desserts
- "boissons" → Boissons
- "boissons-chaudes" → Boissons chaudes
Tu peux ajouter des sous-catégories si nécessaire.

RÈGLES IMPORTANTES :
1. DOUBLONS : Ne garde qu'UNE SEULE FOIS chaque plat.
2. FORMULES : Les formules n'ont PAS de category_ref (mets null). Décris les groupes de choix dans "options" avec source:"category" + category_ref pour un choix parmi une catégorie, ou source:"items" + item_refs pour des items spécifiques/fixes.
3. CATÉGORIES : Utilise les refs standard ci-dessus. ATTENTION plateformes de livraison : ne crée pas une catégorie par plat !
4. OPTIONS / VARIANTES : Pour un plat (non-formule), utilise "choices" (label + price_modifier).
5. PRIX : Nombre décimal. Si absent → null + needs_review.
6. TAGS : végétarien, végan, épicé, sans gluten, maison, populaire, nouveau.
7. INGRÉDIENTS : Déduis l'ingrédient principal du nom si rien n'est listé.
8. DESCRIPTION : Si mentionnée, sinon null.
9. ALLERGÈNES : Déduis des ingrédients (14 allergènes officiels UE).
10. REF : Slug unique par item/catégorie.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks :
{
  "categories": [
    { "ref": "entrees", "name": "Entrées", "display_order": 0 },
    { "ref": "plats", "name": "Plats", "display_order": 1 },
    { "ref": "desserts", "name": "Desserts", "display_order": 2 },
    { "ref": "boissons", "name": "Boissons", "display_order": 3 }
  ],
  "items": [
    {
      "ref": "salade-cesar",
      "category_ref": "entrees",
      "name": "Salade César",
      "description": null,
      "ingredients": ["laitue romaine", "parmesan", "croûtons"],
      "price": 9.50,
      "allergens": ["gluten", "lactose"],
      "tags": [],
      "options": []
    },
    {
      "ref": "menu-midi",
      "category_ref": null,
      "name": "Menu Midi",
      "description": "Entrée + Plat + Dessert",
      "ingredients": [],
      "price": 18.90,
      "allergens": [],
      "tags": [],
      "options": [
        {
          "name": "Entrée au choix",
          "type": "single_choice",
          "required": true,
          "source": "category",
          "category_ref": "entrees",
          "max_price": null
        },
        {
          "name": "Plat au choix",
          "type": "single_choice",
          "required": true,
          "source": "category",
          "category_ref": "plats",
          "max_price": null
        }
      ]
    }
  ],
  "needs_review": [],
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
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "user", content: `${MENU_SCRAPE_PROMPT}\n\n---\nCONTENU DE LA PAGE :\n${truncated}` },
    ],
    max_tokens: 16384,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const finishReason = response.choices[0].finish_reason;

  console.log(`\n====== WEB SCRAPE — OpenAI Response ======`);
  console.log(`finish_reason=${finishReason}, raw length=${raw.length}`);
  console.log(raw);
  console.log(`==========================================\n`);
  if (finishReason === "length") {
    console.warn(`[web-scrape] Response truncated by max_tokens!`);
  }

  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = safeParseJSON(cleaned);

  const rawItems: MenuItemImport[] = (parsed.items || []).map(normalizeImportItem);

  // Déduplication par nom normalisé (safety net)
  const items = deduplicateItems(rawItems);

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
      cuisine_type: "other",
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
      opening_hours_text: [],
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

/**
 * Sauvegarde un ImportResult complet en base
 */
export async function persistImport(data: ImportResult): Promise<string> {
  const { getDb } = await import("../lib/db");
  const { Restaurant } = await import("../db/entities/Restaurant");
  const { MenuCategory: MenuCategoryEntity } = await import("../db/entities/MenuCategory");
  const { MenuItem: MenuItemEntity } = await import("../db/entities/MenuItem");

  const ds = await getDb();
  const r = data.restaurant;

  // 1. Créer le restaurant
  const restaurant = ds.getRepository(Restaurant).create({
    name: r.name,
    cuisineType: r.cuisine_type || "other",
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
    openingHoursText: r.opening_hours_text,
    website: r.website,
    coverImage: r.images.cover,
    gallery: [r.images.cover, ...r.images.gallery].filter(Boolean) as string[],
    googlePlaceRaw: data._import_metadata?.google_place_raw || null,
    serpApiPhotosRaw: data._import_metadata?.serpapi_photos_raw || null,
  });

  const savedRestaurant = await ds.getRepository(Restaurant).save(restaurant);

  // 2. Créer les catégories par défaut + celles de l'IA (mapping ref → id)
  const categoryMap: Record<string, string> = {};

  // Noms normalisés des catégories IA pour éviter les doublons avec les défauts
  const aiCatNorm = new Set(
    data.menu.categories.map((c) =>
      c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    )
  );

  // Créer les catégories par défaut (sauf si l'IA en a déjà créé une avec le même nom)
  for (const def of DEFAULT_CATEGORIES) {
    const norm = def.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (aiCatNorm.has(norm)) continue; // l'IA a sa propre version, on la créera juste après
    const entity = ds.getRepository(MenuCategoryEntity).create({
      restaurantId: savedRestaurant.id,
      name: def.name,
      displayOrder: def.display_order,
    } as any) as unknown as InstanceType<typeof MenuCategoryEntity>;
    const saved = await ds.getRepository(MenuCategoryEntity).save(entity) as unknown as InstanceType<typeof MenuCategoryEntity>;
    categoryMap[def.ref] = saved.id;
  }

  // Créer les catégories de l'IA
  for (const cat of data.menu.categories) {
    const entity = ds.getRepository(MenuCategoryEntity).create({
      restaurantId: savedRestaurant.id,
      name: cat.name,
      displayOrder: cat.display_order,
    } as any) as unknown as InstanceType<typeof MenuCategoryEntity>;
    const saved = await ds.getRepository(MenuCategoryEntity).save(entity) as unknown as InstanceType<typeof MenuCategoryEntity>;
    categoryMap[cat.ref] = saved.id;
  }

  // 3. Créer les items normaux (non-formules) d'abord, pour avoir les refs → IDs
  const itemRefMap: Record<string, string> = {};

  for (const item of data.menu.items) {
    if (isFormule(item)) continue; // on fait les formules après
    const entity = ds.getRepository(MenuItemEntity).create({
      restaurantId: savedRestaurant.id,
      categoryId: categoryMap[item.category_ref] || null,
      name: item.name,
      description: item.description,
      ingredients: item.ingredients || [],
      price: item.price,
      allergens: item.allergens,
      tags: item.tags,
      isAvailable: item.available,
      options: item.options,
    } as any) as unknown as InstanceType<typeof MenuItemEntity>;
    const saved = await ds.getRepository(MenuItemEntity).save(entity) as unknown as InstanceType<typeof MenuItemEntity>;
    itemRefMap[item.ref] = saved.id;
  }

  // 4. Créer les formules (résoudre category_ref et item_refs dans les options)
  for (const item of data.menu.items) {
    if (!isFormule(item)) continue;

    const resolvedOptions = item.options.map((opt: any) => {
      if (opt.source === "category" && opt.category_ref) {
        const catId = categoryMap[opt.category_ref] || null;
        // Résoudre maxPrice → itemIds (sélectionner tous les items de la catégorie ≤ maxPrice)
        let itemIds: string[] | undefined;
        if (opt.maxPrice != null) {
          itemIds = data.menu.items
            .filter((i) => !isFormule(i) && i.category_ref === opt.category_ref && i.price <= opt.maxPrice)
            .map((i) => itemRefMap[i.ref])
            .filter(Boolean);
        } else {
          // Pas de maxPrice → tous les items de la catégorie
          itemIds = data.menu.items
            .filter((i) => !isFormule(i) && i.category_ref === opt.category_ref)
            .map((i) => itemRefMap[i.ref])
            .filter(Boolean);
        }
        const { maxPrice: _mp, max_price: _mp2, category_ref: _cr, ...rest } = opt;
        return { ...rest, categoryId: catId, itemIds };
      }
      if (opt.source === "items" && opt.item_refs) {
        const { item_refs: _ir, maxPrice: _mp, max_price: _mp2, ...rest } = opt;
        return {
          ...rest,
          itemIds: opt.item_refs
            .map((ref: string) => itemRefMap[ref])
            .filter(Boolean),
        };
      }
      return opt;
    });

    const entity = ds.getRepository(MenuItemEntity).create({
      restaurantId: savedRestaurant.id,
      categoryId: null, // formules n'ont pas de catégorie
      name: item.name,
      description: item.description,
      ingredients: [],
      price: item.price,
      allergens: [],
      tags: item.tags,
      isAvailable: item.available,
      options: resolvedOptions,
    } as any);
    await ds.getRepository(MenuItemEntity).save(entity);
  }

  return savedRestaurant.id;
}


// ============================================================
// UTILS
// ============================================================

/** Détecte si un item est une formule (a des options avec source) */
function isFormule(item: MenuItemImport): boolean {
  return item.options.some((o: any) => o.source === "category" || o.source === "items");
}

/** Normalise une option IA (gère les 2 formats : choices classiques vs formule source) */
function normalizeOption(opt: any): any {
  if (opt.source === "category" || opt.source === "items") {
    return {
      name: opt.name,
      type: opt.type || "single_choice",
      required: opt.required ?? true,
      source: opt.source,
      ...(opt.category_ref ? { category_ref: opt.category_ref } : {}),
      ...(opt.item_refs ? { item_refs: opt.item_refs } : {}),
      maxPrice: opt.max_price ?? opt.maxPrice ?? null,
    };
  }
  return {
    name: opt.name,
    type: opt.type || "single_choice",
    required: opt.required ?? false,
    choices: opt.choices || [],
  };
}

/** Normalise un item renvoyé par l'IA */
function normalizeImportItem(item: any): MenuItemImport {
  return {
    ref: item.ref || slugify(item.name),
    category_ref: item.category_ref || null,
    name: item.name,
    description: item.description || null,
    ingredients: item.ingredients || [],
    price: item.price ?? 0,
    allergens: item.allergens || [],
    tags: item.tags || [],
    available: true,
    options: (item.options || []).map(normalizeOption),
  };
}

/**
 * Déduplique les items par nom normalisé (sans accents, minuscule).
 * Les formules et items normaux sont dédupliqués séparément (même nom possible).
 */
function deduplicateItems(items: MenuItemImport[]): MenuItemImport[] {
  const seen = new Map<string, MenuItemImport>();
  for (const item of items) {
    const base = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const key = isFormule(item) ? `formule:${base}` : `item:${base}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      const merged = { ...existing };
      if (item.price > existing.price) merged.price = item.price;
      if (!existing.description && item.description) merged.description = item.description;
      seen.set(key, merged);
    }
  }
  return Array.from(seen.values());
}

/**
 * Parse JSON avec récupération si tronqué (ferme les crochets/accolades manquants)
 */
function safeParseJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[safeParseJSON] Direct parse failed, attempting recovery...`);
    // Tenter de fermer le JSON tronqué
    let fixed = text;
    // Compter les accolades/crochets ouverts
    let braces = 0, brackets = 0;
    let inString = false, escape = false;
    for (const ch of fixed) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") braces++;
      if (ch === "}") braces--;
      if (ch === "[") brackets++;
      if (ch === "]") brackets--;
    }
    // Si on est dans une string, la fermer
    if (inString) fixed += '"';
    // Fermer les crochets/accolades manquants
    while (brackets > 0) { fixed += "]"; brackets--; }
    while (braces > 0) { fixed += "}"; braces--; }
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      console.error(`[safeParseJSON] Recovery failed too. Raw text (first 500 chars):`, text.slice(0, 500));
      throw e2;
    }
  }
}

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
