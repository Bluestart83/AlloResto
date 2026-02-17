/**
 * availability.service.ts — Service unifié de vérification de disponibilité
 *
 * 3 modes :
 *   - pickup   : retrait sur place → heure = now + avgPrepTimeMin
 *   - delivery  : livraison → heure = now + avgPrepTimeMin + trajet
 *   - reservation : réservation de table → vérif places dispo
 */

import { AppDataSource } from "@/db/data-source";
import type { Restaurant } from "@/db/entities/Restaurant";
import type { Reservation } from "@/db/entities/Reservation";
import type { DiningTable } from "@/db/entities/DiningTable";
import type { DiningService } from "@/db/entities/DiningService";
import { checkDelivery } from "./delivery.service";

// ============================================================
// TYPES
// ============================================================

export interface AvailabilityParams {
  restaurantId: string;
  mode: "pickup" | "delivery" | "reservation";
  requestedTime?: string; // HH:MM (optionnel, sinon = dès que possible)
  // delivery only
  customerAddress?: string;
  customerCity?: string;
  customerPostalCode?: string;
  customerLat?: number;
  customerLng?: number;
  // reservation only
  partySize?: number;
  seatingPreference?: string; // "window" | "outdoor" | "large_table" | etc.
}

export interface AvailabilityResult {
  available: boolean;
  mode: string;
  estimatedTime: string;    // HH:MM
  estimatedTimeISO: string; // ISO 8601
  reason?: string;
  // delivery extras
  deliveryDistanceKm?: number;
  deliveryDurationMin?: number;
  deliveryFee?: number;
  customerAddressFormatted?: string;
  customerLat?: number;
  customerLng?: number;
  // reservation extras
  seatsAvailable?: number;
  serviceId?: string;
  serviceName?: string;
  // facturation
  googleApiCalls?: number;
}

// ============================================================
// HELPERS
// ============================================================

function parisNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
}

function formatHHMM(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function parseRequestedTime(hhmm: string, refDate: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const result = new Date(refDate);
  result.setHours(h, m, 0, 0);
  // Si l'heure demandée est déjà passée, c'est pour demain
  if (result <= refDate) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

// ============================================================
// MAIN
// ============================================================

export async function checkAvailability(
  params: AvailabilityParams
): Promise<AvailabilityResult> {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();

  const restaurant = await ds
    .getRepository<Restaurant>("restaurants")
    .findOneBy({ id: params.restaurantId });

  if (!restaurant) {
    return {
      available: false,
      mode: params.mode,
      estimatedTime: "",
      estimatedTimeISO: "",
      reason: "restaurant_not_found",
    };
  }

  const now = parisNow();

  // ── PICKUP ──
  if (params.mode === "pickup") {
    const minReady = new Date(now.getTime() + restaurant.avgPrepTimeMin * 60000);
    let finalTime = minReady;

    if (params.requestedTime) {
      const requested = parseRequestedTime(params.requestedTime, now);
      if (requested > minReady) {
        finalTime = requested;
      }
    }

    return {
      available: true,
      mode: "pickup",
      estimatedTime: formatHHMM(finalTime),
      estimatedTimeISO: finalTime.toISOString(),
    };
  }

  // ── DELIVERY ──
  if (params.mode === "delivery") {
    if (!restaurant.deliveryEnabled) {
      return {
        available: false,
        mode: "delivery",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: "delivery_not_enabled",
      };
    }

    if (!params.customerAddress) {
      return {
        available: false,
        mode: "delivery",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: "customer_address_required",
      };
    }

    if (!restaurant.lat || !restaurant.lng) {
      return {
        available: false,
        mode: "delivery",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: "restaurant_coordinates_missing",
      };
    }

    const deliveryResult = await checkDelivery({
      restaurantLat: restaurant.lat,
      restaurantLng: restaurant.lng,
      deliveryRadiusKm: restaurant.deliveryRadiusKm,
      avgPrepTimeMin: restaurant.avgPrepTimeMin,
      customerAddress: params.customerAddress,
      customerCity: params.customerCity,
      customerPostalCode: params.customerPostalCode,
      customerLat: params.customerLat,
      customerLng: params.customerLng,
    });

    if (!deliveryResult.isDeliverable) {
      return {
        available: false,
        mode: "delivery",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: deliveryResult.reason || "not_deliverable",
        deliveryDistanceKm: deliveryResult.distanceKm,
        customerAddressFormatted: deliveryResult.customerAddressFormatted,
      };
    }

    const totalMin = restaurant.avgPrepTimeMin + deliveryResult.durationMin;
    const minReady = new Date(now.getTime() + totalMin * 60000);
    let finalTime = minReady;

    if (params.requestedTime) {
      const requested = parseRequestedTime(params.requestedTime, now);
      if (requested > minReady) {
        finalTime = requested;
      }
    }

    // Calcul frais de livraison
    let fee = Number(restaurant.deliveryFee) || 0;
    if (restaurant.deliveryFreeAbove && fee > 0) {
      // Le fee sera appliqué au moment de la commande selon le montant total
      // On retourne le fee standard ici
    }

    return {
      available: true,
      mode: "delivery",
      estimatedTime: formatHHMM(finalTime),
      estimatedTimeISO: finalTime.toISOString(),
      deliveryDistanceKm: deliveryResult.distanceKm,
      deliveryDurationMin: deliveryResult.durationMin,
      deliveryFee: fee,
      customerAddressFormatted: deliveryResult.customerAddressFormatted,
      customerLat: deliveryResult.customerLat,
      customerLng: deliveryResult.customerLng,
      googleApiCalls: deliveryResult.googleApiCalls,
    };
  }

  // ── RESERVATION ──
  if (params.mode === "reservation") {
    if (!restaurant.reservationEnabled) {
      return {
        available: false,
        mode: "reservation",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: "reservation_not_enabled",
      };
    }

    if (!params.partySize || params.partySize < 1) {
      return {
        available: false,
        mode: "reservation",
        estimatedTime: "",
        estimatedTimeISO: "",
        reason: "party_size_required",
      };
    }

    // Déterminer l'heure de la réservation
    let reservationTime: Date;
    if (params.requestedTime) {
      reservationTime = parseRequestedTime(params.requestedTime, now);
    } else {
      // Dès que possible = now + minReservationAdvanceMin
      reservationTime = new Date(
        now.getTime() + restaurant.minReservationAdvanceMin * 60000
      );
    }

    // Vérifier avance minimum
    const minAdvance = new Date(
      now.getTime() + restaurant.minReservationAdvanceMin * 60000
    );
    if (reservationTime < minAdvance) {
      return {
        available: false,
        mode: "reservation",
        estimatedTime: formatHHMM(reservationTime),
        estimatedTimeISO: reservationTime.toISOString(),
        reason: `reservation_too_soon_min_${restaurant.minReservationAdvanceMin}min`,
      };
    }

    // Vérifier avance maximum
    const maxAdvance = new Date(
      now.getTime() + restaurant.maxReservationAdvanceDays * 86400000
    );
    if (reservationTime > maxAdvance) {
      return {
        available: false,
        mode: "reservation",
        estimatedTime: formatHHMM(reservationTime),
        estimatedTimeISO: reservationTime.toISOString(),
        reason: `reservation_too_far_max_${restaurant.maxReservationAdvanceDays}days`,
      };
    }

    // Chercher un service actif correspondant au créneau
    const dayOfWeek = reservationTime.getDay() === 0 ? 7 : reservationTime.getDay(); // 1=Lun..7=Dim
    const reqHHMM = formatHHMM(reservationTime);
    const allServices = await ds
      .getRepository<DiningService>("dining_services")
      .find({ where: { restaurantId: params.restaurantId, isActive: true } });

    const matchingService = allServices.find((svc) => {
      if (!svc.dayOfWeek.includes(dayOfWeek)) return false;
      const cutoff = svc.lastSeatingTime || svc.endTime;
      return reqHHMM >= svc.startTime && reqHHMM <= cutoff;
    });

    // Durée du repas : service > restaurant fallback
    const durationMin = matchingService?.defaultDurationMin || restaurant.avgMealDurationMin;
    const endTime = new Date(reservationTime.getTime() + durationMin * 60000);

    // Capacité max : service.maxCovers > tables > restaurant.totalSeats
    let totalSeats: number;
    if (matchingService) {
      totalSeats = matchingService.maxCovers;
    } else {
      const activeTables = await ds
        .getRepository<DiningTable>("dining_tables")
        .find({ where: { restaurantId: params.restaurantId, isActive: true } });
      totalSeats =
        activeTables.length > 0
          ? activeTables.reduce((sum, t) => sum + t.seats, 0)
          : restaurant.totalSeats;
    }

    // Compter les places occupées sur le créneau
    const overlapping = await ds
      .getRepository<Reservation>("reservations")
      .createQueryBuilder("r")
      .where("r.restaurant_id = :rid", { rid: params.restaurantId })
      .andWhere("r.status IN (:...statuses)", {
        statuses: ["pending", "confirmed", "seated"],
      })
      .andWhere("r.reservation_time < :endTime", {
        endTime: endTime.toISOString(),
      })
      .andWhere("r.end_time > :startTime", {
        startTime: reservationTime.toISOString(),
      })
      .getMany();

    const occupiedSeats = overlapping.reduce(
      (sum, r) => sum + r.partySize,
      0
    );
    const seatsAvailable = totalSeats - occupiedSeats;

    if (seatsAvailable < params.partySize) {
      return {
        available: false,
        mode: "reservation",
        estimatedTime: formatHHMM(reservationTime),
        estimatedTimeISO: reservationTime.toISOString(),
        reason: `not_enough_seats_available_${seatsAvailable}_requested_${params.partySize}`,
        seatsAvailable,
        serviceId: matchingService?.id,
        serviceName: matchingService?.name,
      };
    }

    return {
      available: true,
      mode: "reservation",
      estimatedTime: formatHHMM(reservationTime),
      estimatedTimeISO: reservationTime.toISOString(),
      seatsAvailable,
      serviceId: matchingService?.id,
      serviceName: matchingService?.name,
    };
  }

  return {
    available: false,
    mode: params.mode,
    estimatedTime: "",
    estimatedTimeISO: "",
    reason: "unknown_mode",
  };
}
