/**
 * Mapping bidirectionnel : modèle interne ↔ API Zenchef (Formitable v1.2).
 */
import type { ReservationSyncDTO, AvailabilitySlot } from "../connector.interface";
import type {
  ZenchefBookingRequest,
  ZenchefBookingResponse,
  ZenchefBookingStatus,
  ZenchefDayAvailabilityResponse,
} from "./zenchef.types";
import type { Reservation } from "@/db/entities/Reservation";
import { findMapping } from "../../external-mapping.service";

// ---------------------------------------------------------------------------
// Locale → culture
// ---------------------------------------------------------------------------

const LOCALE_TO_CULTURE: Record<string, string> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  nl: "nl-NL",
};

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

const ZENCHEF_TO_LOCAL_STATUS: Record<ZenchefBookingStatus, string> = {
  pending: "pending",
  accepted: "confirmed",
  changed: "confirmed",
  canceled: "cancelled",
  checked_in: "seated",
  checked_out: "completed",
};

/**
 * Mappe le statut Zenchef vers notre statut local.
 */
export function mapZenchefStatusToLocal(zcStatus: ZenchefBookingStatus): string {
  return ZENCHEF_TO_LOCAL_STATUS[zcStatus] || "pending";
}

/**
 * Mappe le statut local vers une action Zenchef.
 * Retourne null pour les statuts qui nécessitent un endpoint spécial (checkin/checkout/DELETE).
 */
export function mapLocalStatusToZenchef(
  localStatus: string,
): { type: "status"; value: string } | { type: "action"; value: string } | null {
  switch (localStatus) {
    case "pending":
      return { type: "status", value: "pending" };
    case "confirmed":
      return { type: "status", value: "accepted" };
    case "seated":
      return { type: "action", value: "checkin" };
    case "completed":
      return { type: "action", value: "checkout" };
    case "cancelled":
    case "no_show":
      return { type: "action", value: "cancel" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// DTO → Zenchef (outbound)
// ---------------------------------------------------------------------------

/**
 * Convertit notre DTO en body de requête Zenchef.
 */
export function toZenchefBooking(
  dto: ReservationSyncDTO,
  locale: string,
  localReservationId?: string,
): ZenchefBookingRequest {
  const nameParts = (dto.customerName || "").split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const req: ZenchefBookingRequest = {
    booking_date_time: dto.reservationTime,
    booking_duration: dto.durationMin || 90,
    number_of_people: dto.partySize,
    culture: LOCALE_TO_CULTURE[locale] || "fr-FR",
    first_name: firstName,
    last_name: lastName,
    telephone: dto.customerPhone,
    email: dto.customerEmail,
    comments: dto.notes,
    tables: dto.tableExternalIds,
    external_reference_id: localReservationId,
    walk_in: false,
  };
  if (dto.serviceExternalId) (req as any).service_uid = dto.serviceExternalId;
  if (dto.diningRoomExternalId) (req as any).section_uid = dto.diningRoomExternalId;
  if (dto.offerExternalId) (req as any).offer_uid = dto.offerExternalId;
  return req;
}

// ---------------------------------------------------------------------------
// Zenchef → DTO (inbound)
// ---------------------------------------------------------------------------

/**
 * Convertit une réponse Zenchef en notre DTO.
 */
export function fromZenchefBooking(zb: ZenchefBookingResponse): ReservationSyncDTO {
  const tableExternalIds = Array.isArray(zb.tables)
    ? zb.tables.map((t) => (typeof t === "string" ? t : t.uid))
    : [];

  return {
    customerName: `${zb.first_name} ${zb.last_name}`.trim(),
    customerPhone: zb.telephone,
    customerEmail: zb.email || undefined,
    partySize: zb.number_of_people,
    reservationTime: zb.booking_date_time,
    durationMin: zb.booking_duration,
    tableExternalIds: tableExternalIds.length > 0 ? tableExternalIds : undefined,
    serviceExternalId: zb.service_uid || undefined,
    diningRoomExternalId: zb.section_uid || undefined,
    offerExternalId: zb.offer_uid || undefined,
    status: mapZenchefStatusToLocal(zb.status),
    notes: zb.comments || undefined,
  };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Convertit la réponse d'availability Zenchef en nos slots.
 */
export function fromZenchefAvailability(
  resp: ZenchefDayAvailabilityResponse,
): AvailabilitySlot[] {
  if (!resp?.slots) return [];
  return resp.slots
    .filter((s) => s.available)
    .map((s) => ({
      time: s.time,
      remainingCovers: -1, // Zenchef ne donne pas le nombre exact
    }));
}

// ---------------------------------------------------------------------------
// Reservation entity → DTO (pour outbound sync)
// ---------------------------------------------------------------------------

/**
 * Convertit une entité Reservation locale en ReservationSyncDTO.
 * Si `platform` est fourni, résout les IDs externes via SyncExternalMapping.
 */
export async function reservationToDTO(r: Reservation, platform?: string): Promise<ReservationSyncDTO> {
  const dto: ReservationSyncDTO = {
    customerName: r.customerName || "",
    customerPhone: r.customerPhone,
    partySize: r.partySize,
    adults: r.adults || undefined,
    children: r.children || undefined,
    reservationTime: r.reservationTime instanceof Date
      ? r.reservationTime.toISOString()
      : String(r.reservationTime),
    durationMin: r.durationMin || undefined,
    status: r.status,
    notes: r.notes || undefined,
    allergies: r.allergies || undefined,
    dietaryRestrictions: r.dietaryRestrictions || undefined,
    occasion: r.occasion || undefined,
  };

  if (platform) {
    if (r.serviceId) {
      const m = await findMapping("dining_service", r.serviceId, platform);
      if (m) dto.serviceExternalId = m.externalId;
    }
    if (r.offerId) {
      const m = await findMapping("offer", r.offerId, platform);
      if (m) dto.offerExternalId = m.externalId;
    }
    if (r.diningRoomId) {
      const m = await findMapping("dining_room", r.diningRoomId, platform);
      if (m) dto.diningRoomExternalId = m.externalId;
    }
    if (r.tableIds && r.tableIds.length > 0) {
      const extIds: string[] = [];
      for (const tid of r.tableIds) {
        const m = await findMapping("table", tid, platform);
        if (m) extIds.push(m.externalId);
      }
      if (extIds.length > 0) dto.tableExternalIds = extIds;
    }
  }

  return dto;
}
