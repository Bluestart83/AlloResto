/**
 * delivery.service.ts — Géocodage + calcul livraison via Google Maps API
 *
 * Utilisé par :
 *   - L'API Next.js pendant un appel (le service Python PJSIP appelle cette route)
 *   - Le wizard d'import pour géocoder le restaurant
 *   - Le dashboard pour les stats de distance
 *
 * APIs Google :
 *   - Geocoding API          (~0.005€/requête)
 *   - Distance Matrix API    (~0.005€/requête)
 *   Total : ~0.01€ par vérification d'adresse
 */

// ============================================================
// TYPES
// ============================================================

export interface GeoPoint {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface DeliveryCheck {
  isDeliverable: boolean;

  // Coordonnées client
  customerLat: number;
  customerLng: number;
  customerAddressFormatted: string;

  // Distance & temps
  distanceKm: number;
  durationMin: number;
  distanceText: string;
  durationText: string;

  // Livraison
  estimatedDeliveryMin: number;
  reason?: string;

  // Facturation API
  googleApiCalls: number;
}

interface RouteResult {
  distanceKm: number;
  distanceText: string;
  durationMin: number;
  durationText: string;
}

// ============================================================
// CONFIG
// ============================================================

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_MAPS_API_KEY manquant dans .env");
}

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DISTANCE_MATRIX_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";

// ============================================================
// 1. GÉOCODAGE : adresse texte → coordonnées
// ============================================================

export async function geocodeAddress(
  address: string,
  city: string = "",
  postalCode: string = "",
  country: string = "FR"
): Promise<GeoPoint | null> {
  const fullAddress = [address, postalCode, city, country]
    .filter(Boolean)
    .join(", ");

  const params = new URLSearchParams({
    address: fullAddress,
    language: "fr",
    region: "fr",
    key: GOOGLE_API_KEY,
  });

  const resp = await fetch(`${GEOCODE_URL}?${params}`);
  const data = await resp.json();

  if (data.status !== "OK" || !data.results?.length) {
    console.warn(`Geocoding failed for '${fullAddress}': ${data.status}`);
    return null;
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;

  return {
    lat,
    lng,
    formattedAddress: result.formatted_address,
  };
}

// ============================================================
// 2. DISTANCE & TEMPS (route réelle, pas vol d'oiseau)
// ============================================================

export async function getRouteDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: "driving" | "bicycling" = "driving"
): Promise<RouteResult | null> {
  const params = new URLSearchParams({
    origins: `${originLat},${originLng}`,
    destinations: `${destLat},${destLng}`,
    mode,
    language: "fr",
    key: GOOGLE_API_KEY,
  });

  const resp = await fetch(`${DISTANCE_MATRIX_URL}?${params}`);
  const data = await resp.json();

  if (data.status !== "OK") {
    console.warn(`Distance Matrix failed: ${data.status}`);
    return null;
  }

  const element = data.rows[0]?.elements[0];
  if (!element || element.status !== "OK") {
    console.warn(`Route not found: ${element?.status}`);
    return null;
  }

  return {
    distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
    distanceText: element.distance.text,
    durationMin: Math.ceil(element.duration.value / 60),
    durationText: element.duration.text,
  };
}

// ============================================================
// 3. VOL D'OISEAU (fallback gratuit, sans API)
// ============================================================

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ============================================================
// 4. VÉRIFICATION COMPLÈTE DE LIVRAISON
// ============================================================

export async function checkDelivery(params: {
  restaurantLat: number;
  restaurantLng: number;
  deliveryRadiusKm: number;
  avgPrepTimeMin: number;
  customerAddress: string;
  customerCity?: string;
  customerPostalCode?: string;
  /** Coordonnées GPS déjà connues du client — évite le géocodage Google */
  customerLat?: number;
  customerLng?: number;
}): Promise<DeliveryCheck> {
  const {
    restaurantLat,
    restaurantLng,
    deliveryRadiusKm,
    avgPrepTimeMin,
    customerAddress,
    customerCity = "",
    customerPostalCode = "",
    customerLat: storedLat,
    customerLng: storedLng,
  } = params;

  let lat: number;
  let lng: number;
  let formattedAddress: string;
  let googleApiCalls = 0;

  if (storedLat && storedLng) {
    // Coordonnées déjà connues — pas de géocodage
    lat = storedLat;
    lng = storedLng;
    formattedAddress = [customerAddress, customerPostalCode, customerCity]
      .filter(Boolean)
      .join(", ");
  } else {
    // Géocodage Google (1 appel API)
    const geo = await geocodeAddress(
      customerAddress,
      customerCity,
      customerPostalCode
    );
    googleApiCalls++;

    if (!geo) {
      return {
        isDeliverable: false,
        customerLat: 0,
        customerLng: 0,
        customerAddressFormatted: customerAddress,
        distanceKm: 0,
        durationMin: 0,
        distanceText: "",
        durationText: "",
        estimatedDeliveryMin: 0,
        reason: "address_not_found",
        googleApiCalls,
      };
    }

    lat = geo.lat;
    lng = geo.lng;
    formattedAddress = geo.formattedAddress;
  }

  // Distance par approximation géodésique (haversine × 1.4 pour route)
  const straightKm = haversineKm(restaurantLat, restaurantLng, lat, lng);
  const roadKm = Math.round(straightKm * 1.4 * 10) / 10;
  const durationMin = Math.ceil(roadKm * 3); // ~20 km/h en ville

  // Vérifier rayon
  const isDeliverable = straightKm <= deliveryRadiusKm;

  // Temps total
  const estimatedDeliveryMin = avgPrepTimeMin + durationMin;

  return {
    isDeliverable,
    customerLat: lat,
    customerLng: lng,
    customerAddressFormatted: formattedAddress,
    distanceKm: roadKm,
    durationMin,
    distanceText: `~${roadKm} km`,
    durationText: `~${durationMin} min`,
    estimatedDeliveryMin,
    reason: isDeliverable
      ? undefined
      : `distance_${roadKm}km_max_${deliveryRadiusKm}km`,
    googleApiCalls,
  };
}

// ============================================================
// 5. GÉOCODER UN RESTAURANT (une seule fois, au setup)
// ============================================================

export async function geocodeRestaurant(
  address: string,
  city: string,
  postalCode: string
): Promise<GeoPoint | null> {
  return geocodeAddress(address, city, postalCode);
}
