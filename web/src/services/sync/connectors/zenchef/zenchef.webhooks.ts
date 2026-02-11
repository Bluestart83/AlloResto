/**
 * Parsing et validation des webhooks Zenchef entrants.
 */
import { createHmac } from "crypto";
import type { WebhookEvent } from "../connector.interface";
import type { ZenchefWebhookPayload, ZenchefWebhookEventType } from "./zenchef.types";
import { mapZenchefStatusToLocal } from "./zenchef.mapper";

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<ZenchefWebhookEventType, WebhookEvent["eventType"]> = {
  "booking.created": "reservation.created",
  "booking.accepted": "reservation.status_changed",
  "booking.changed": "reservation.updated",
  "booking.canceled": "reservation.cancelled",
  "booking.checkin": "reservation.status_changed",
  "booking.checkout": "reservation.status_changed",
};

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

/**
 * Valide la signature HMAC SHA-256 du webhook.
 * @throws si la signature est absente ou invalide.
 */
export function validateZenchefSignature(
  headers: Record<string, string>,
  body: Record<string, any>,
  secret: string,
): void {
  const signature =
    headers["x-zenchef-signature"] ||
    headers["x-formitable-signature"];

  if (!signature) {
    throw new Error("Webhook signature missing");
  }

  const expectedSig = createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");

  if (signature !== expectedSig) {
    throw new Error("Webhook signature invalid");
  }
}

// ---------------------------------------------------------------------------
// Webhook parsing
// ---------------------------------------------------------------------------

/**
 * Parse un payload webhook Zenchef en WebhookEvent générique.
 */
export function parseZenchefWebhook(body: Record<string, any>): WebhookEvent {
  const payload = body as ZenchefWebhookPayload;

  if (!payload.event || !payload.booking) {
    throw new Error("Invalid Zenchef webhook payload: missing event or booking");
  }

  const eventType = EVENT_TYPE_MAP[payload.event];
  if (!eventType) {
    throw new Error(`Unknown Zenchef webhook event: ${payload.event}`);
  }

  const tableExternalIds = Array.isArray(payload.booking.tables)
    ? payload.booking.tables.map((t) => (typeof t === "string" ? t : t.uid))
    : [];

  return {
    eventType,
    externalId: payload.booking.uid,
    rawPayload: body,
    data: {
      customerName: `${payload.booking.first_name} ${payload.booking.last_name}`.trim(),
      customerPhone: payload.booking.telephone,
      customerEmail: payload.booking.email || undefined,
      partySize: payload.booking.number_of_people,
      reservationTime: payload.booking.booking_date_time,
      durationMin: payload.booking.booking_duration,
      status: mapZenchefStatusToLocal(payload.booking.status),
      notes: payload.booking.comments || undefined,
      tableExternalIds,
      serviceExternalId: payload.booking.service_uid || undefined,
      diningRoomExternalId: payload.booking.section_uid || undefined,
      offerExternalId: payload.booking.offer_uid || undefined,
      externalReferenceId: payload.booking.external_reference_id,
      zenchefEvent: payload.event,
      walkIn: payload.booking.walk_in || false,
    },
  };
}
