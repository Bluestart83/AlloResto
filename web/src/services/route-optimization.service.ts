/**
 * route-optimization.service.ts — Optimisation de tournées de livraison
 *
 * Utilise l'API Google Directions avec optimizeWaypoints: true (résolution TSP).
 * Supporte jusqu'à 25 waypoints. Livraison restaurant typique : 3-8 arrêts.
 * Coût : ~0.01 EUR par optimisation.
 *
 * Fallback : haversine + nearest-neighbor si l'API échoue.
 */

import type { TripStop } from "@/db/entities/DeliveryTrip";
import type { Order } from "@/db/entities/Order";
import { haversineKm } from "./delivery.service";

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

/** Temps moyen passé à chaque arrêt (remise au client) */
const DWELL_TIME_MIN = 3;

// ============================================================
// TYPES
// ============================================================

export interface RouteOptimizationResult {
  stops: TripStop[];
  totalDistanceKm: number;
  totalDurationMin: number;
  googleMapsUrl: string;
  overviewPolyline: string | null;
}

// ============================================================
// 1. OPTIMISATION VIA GOOGLE DIRECTIONS API
// ============================================================

export async function optimizeRoute(
  restaurantLat: number,
  restaurantLng: number,
  orders: Order[],
  departureTime?: Date,
): Promise<RouteOptimizationResult> {
  if (orders.length === 0) {
    return { stops: [], totalDistanceKm: 0, totalDurationMin: 0, googleMapsUrl: "", overviewPolyline: null };
  }

  // Une seule commande → pas besoin d'optimiser
  if (orders.length === 1) {
    return buildSingleStopResult(restaurantLat, restaurantLng, orders[0], departureTime);
  }

  // Essayer Google Directions API
  if (GOOGLE_API_KEY) {
    try {
      return await optimizeWithGoogle(restaurantLat, restaurantLng, orders, departureTime);
    } catch (err) {
      console.warn("Google Directions API failed, falling back to nearest-neighbor:", err);
    }
  }

  // Fallback : nearest-neighbor avec haversine
  return optimizeWithNearestNeighbor(restaurantLat, restaurantLng, orders, departureTime);
}

// ============================================================
// 2. GOOGLE DIRECTIONS API
// ============================================================

async function optimizeWithGoogle(
  restaurantLat: number,
  restaurantLng: number,
  orders: Order[],
  departureTime?: Date,
): Promise<RouteOptimizationResult> {
  const origin = `${restaurantLat},${restaurantLng}`;

  // Waypoints = toutes les adresses de livraison
  const waypointCoords = orders.map(
    (o) => `${o.deliveryLat},${o.deliveryLng}`,
  );

  // Dernier stop = destination, les autres = waypoints optimisés
  // On met "optimize:true" pour laisser Google réordonner
  const waypointsParam = `optimize:true|${waypointCoords.join("|")}`;

  // Destination = dernier waypoint (Google le détermine après optimisation)
  // On utilise le restaurant comme destination fictive pour forcer un circuit
  // Mais en pratique le livreur s'arrête au dernier point → on utilise le dernier waypoint
  // Pour laisser Google optimiser librement, on met origin = destination = restaurant
  // et tous les stops comme waypoints
  const params = new URLSearchParams({
    origin,
    destination: origin, // retour au restaurant pour obtenir l'optimisation complète
    waypoints: waypointsParam,
    mode: "driving",
    language: "fr",
    key: GOOGLE_API_KEY,
  });

  if (departureTime && departureTime.getTime() > Date.now()) {
    params.set("departure_time", Math.floor(departureTime.getTime() / 1000).toString());
  } else {
    params.set("departure_time", "now");
  }

  const resp = await fetch(`${DIRECTIONS_URL}?${params}`);
  const data = await resp.json();

  if (data.status !== "OK" || !data.routes?.length) {
    throw new Error(`Google Directions API: ${data.status} — ${data.error_message || ""}`);
  }

  const route = data.routes[0];
  const waypointOrder: number[] = route.waypoint_order; // indices réordonnés
  const legs = route.legs; // N+1 legs (origin→wp1, wp1→wp2, ..., wpN→destination)

  // Construire les stops dans l'ordre optimisé
  const now = departureTime || new Date();
  let cumulativeMin = 0;
  const stops: TripStop[] = [];
  let totalDistanceKm = 0;

  for (let i = 0; i < waypointOrder.length; i++) {
    const originalIndex = waypointOrder[i];
    const order = orders[originalIndex];
    const leg = legs[i]; // leg du stop précédent (ou origin) vers ce stop

    const legDurationMin = Math.ceil(leg.duration.value / 60);
    const legDistanceKm = Math.round((leg.distance.value / 1000) * 10) / 10;

    cumulativeMin += legDurationMin;
    totalDistanceKm += legDistanceKm;

    const eta = new Date(now.getTime() + cumulativeMin * 60_000);

    stops.push({
      orderId: order.id,
      sequence: i,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress || "",
      deliveryLat: Number(order.deliveryLat),
      deliveryLng: Number(order.deliveryLng),
      estimatedArrival: eta.toISOString(),
      legDistanceKm,
      legDurationMin,
      deliveredAt: null,
      orderTotal: Number(order.total),
      itemCount: 0, // sera rempli par l'API
      notes: order.notes,
    });

    // Ajouter le temps d'arrêt (remise)
    cumulativeMin += DWELL_TIME_MIN;
  }

  // Distance totale = somme des legs (sans le retour au restaurant)
  // Le dernier leg est le retour → on ne le compte pas pour totalDurationMin
  const totalDurationMin = cumulativeMin;

  const googleMapsUrl = buildGoogleMapsUrl(restaurantLat, restaurantLng, stops);

  return {
    stops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDurationMin,
    googleMapsUrl,
    overviewPolyline: route.overview_polyline?.points || null,
  };
}

// ============================================================
// 3. FALLBACK : NEAREST-NEIGHBOR (gratuit)
// ============================================================

function optimizeWithNearestNeighbor(
  restaurantLat: number,
  restaurantLng: number,
  orders: Order[],
  departureTime?: Date,
): RouteOptimizationResult {
  const remaining = [...orders];
  const sorted: Order[] = [];
  let currentLat = restaurantLat;
  let currentLng = restaurantLng;

  // Greedy nearest-neighbor
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(
        currentLat, currentLng,
        Number(remaining[i].deliveryLat), Number(remaining[i].deliveryLng),
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    sorted.push(next);
    currentLat = Number(next.deliveryLat);
    currentLng = Number(next.deliveryLng);
  }

  // Construire les stops
  const now = departureTime || new Date();
  let cumulativeMin = 0;
  let totalDistanceKm = 0;
  let prevLat = restaurantLat;
  let prevLng = restaurantLng;

  const stops: TripStop[] = sorted.map((order, i) => {
    const dist = haversineKm(prevLat, prevLng, Number(order.deliveryLat), Number(order.deliveryLng));
    // Facteur 1.4 pour distance route réelle + ~25 km/h en ville
    const legDistanceKm = Math.round(dist * 1.4 * 10) / 10;
    const legDurationMin = Math.ceil(legDistanceKm * (60 / 25));

    cumulativeMin += legDurationMin;
    totalDistanceKm += legDistanceKm;

    const eta = new Date(now.getTime() + cumulativeMin * 60_000);

    prevLat = Number(order.deliveryLat);
    prevLng = Number(order.deliveryLng);

    cumulativeMin += DWELL_TIME_MIN;

    return {
      orderId: order.id,
      sequence: i,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress || "",
      deliveryLat: Number(order.deliveryLat),
      deliveryLng: Number(order.deliveryLng),
      estimatedArrival: eta.toISOString(),
      legDistanceKm,
      legDurationMin,
      deliveredAt: null,
      orderTotal: Number(order.total),
      itemCount: 0,
      notes: order.notes,
    };
  });

  return {
    stops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDurationMin: cumulativeMin,
    googleMapsUrl: buildGoogleMapsUrl(restaurantLat, restaurantLng, stops),
    overviewPolyline: null,
  };
}

// ============================================================
// 4. CAS TRIVIAL : 1 SEUL STOP
// ============================================================

function buildSingleStopResult(
  restaurantLat: number,
  restaurantLng: number,
  order: Order,
  departureTime?: Date,
): RouteOptimizationResult {
  const dist = haversineKm(restaurantLat, restaurantLng, Number(order.deliveryLat), Number(order.deliveryLng));
  const legDistanceKm = Math.round(dist * 1.4 * 10) / 10;
  const legDurationMin = order.deliveryDurationMin || Math.ceil(legDistanceKm * (60 / 25));
  const now = departureTime || new Date();
  const eta = new Date(now.getTime() + legDurationMin * 60_000);

  const stop: TripStop = {
    orderId: order.id,
    sequence: 0,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress || "",
    deliveryLat: Number(order.deliveryLat),
    deliveryLng: Number(order.deliveryLng),
    estimatedArrival: eta.toISOString(),
    legDistanceKm,
    legDurationMin,
    deliveredAt: null,
    orderTotal: Number(order.total),
    itemCount: 0,
    notes: order.notes,
  };

  return {
    stops: [stop],
    totalDistanceKm: legDistanceKm,
    totalDurationMin: legDurationMin + DWELL_TIME_MIN,
    googleMapsUrl: buildGoogleMapsUrl(restaurantLat, restaurantLng, [stop]),
    overviewPolyline: null,
  };
}

// ============================================================
// 5. GOOGLE MAPS URL (navigation turn-by-turn)
// ============================================================

export function buildGoogleMapsUrl(
  restaurantLat: number,
  restaurantLng: number,
  stops: TripStop[],
): string {
  if (stops.length === 0) return "";

  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const origin = `${restaurantLat},${restaurantLng}`;

  // Destination = dernier arrêt
  const last = sorted[sorted.length - 1];
  const destination = `${last.deliveryLat},${last.deliveryLng}`;

  // Waypoints intermédiaires (tous sauf le dernier)
  const intermediates = sorted.slice(0, -1);
  const waypoints = intermediates.map((s) => `${s.deliveryLat},${s.deliveryLng}`).join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params}`;
}
