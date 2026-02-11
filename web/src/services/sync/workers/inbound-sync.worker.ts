/**
 * Inbound sync — traite les webhooks entrants des plateformes.
 */
import { getDb } from "@/lib/db";
import { Reservation } from "@/db/entities/Reservation";
import { Restaurant } from "@/db/entities/Restaurant";
import { Customer } from "@/db/entities/Customer";
import { getConnector } from "../connectors/connector.registry";
import { findByExternalId, upsertMapping } from "../external-mapping.service";
import { createSyncLog } from "../sync-log.service";
import { getReservationMaster, resolveConflict } from "../mastering.service";
import type { WebhookEvent } from "../connectors/connector.interface";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboundWebhookParams {
  platform: string;
  restaurantId: string;
  headers: Record<string, string>;
  body: Record<string, any>;
  webhookSecret: string | null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Point d'entrée principal pour traiter un webhook entrant.
 */
export async function processInboundWebhook(
  params: InboundWebhookParams,
): Promise<void> {
  const { platform, restaurantId, headers, body, webhookSecret } = params;
  const startMs = Date.now();

  // 1. Parser le webhook via le connecteur
  const connector = await getConnector(platform, restaurantId);
  // Si webhookSecret est null, le connecteur skip la validation signature
  if (!webhookSecret) {
    // Override: authenticate sans secret pour le parsing
  }
  const event = await connector.parseWebhook(headers, body);

  // 2. Router par type d'événement
  switch (event.eventType) {
    case "reservation.created":
      await handleReservationCreated(platform, restaurantId, event, startMs);
      break;
    case "reservation.updated":
      await handleReservationUpdated(platform, restaurantId, event, startMs);
      break;
    case "reservation.cancelled":
      await handleReservationCancelled(platform, restaurantId, event, startMs);
      break;
    case "reservation.status_changed":
      await handleReservationStatusChanged(platform, restaurantId, event, startMs);
      break;
    default:
      console.warn(`[inbound-sync] Unhandled event type: ${event.eventType}`);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleReservationCreated(
  platform: string,
  restaurantId: string,
  event: WebhookEvent,
  startMs: number,
): Promise<void> {
  const db = await getDb();
  const data = event.data;

  // Vérifier si on a déjà cette réservation (via mapping)
  const existing = await findByExternalId(platform, event.externalId, "reservation");
  if (existing) {
    return handleReservationUpdated(platform, restaurantId, event, startMs);
  }

  // Vérifier via external_reference_id (= notre reservation.id envoyé lors du create outbound)
  if (data.externalReferenceId) {
    const localReservation = await db.getRepository(Reservation).findOneBy({
      id: data.externalReferenceId,
    });
    if (localReservation) {
      // Réservation existe déjà localement — juste créer le mapping
      await upsertMapping({
        entityType: "reservation",
        entityId: localReservation.id,
        platform,
        externalId: event.externalId,
        externalRawData: event.rawPayload,
      });
      await createSyncLog({
        restaurantId,
        entityType: "reservation",
        entityId: localReservation.id,
        platform,
        externalId: event.externalId,
        direction: "inbound",
        action: "create",
        status: "skipped",
        conflictResolution: "Already exists locally (matched by externalReferenceId)",
        durationMs: Date.now() - startMs,
      });
      return;
    }
  }

  // Charger le restaurant pour les défauts
  const restaurant = await db.getRepository(Restaurant).findOneBy({ id: restaurantId });
  if (!restaurant) throw new Error(`Restaurant not found: ${restaurantId}`);

  // Upsert client
  const customerId = await upsertCustomer(restaurantId, data);

  // Résoudre les IDs externes → locaux
  const resolved = await resolveExternalIds(platform, data);

  // Calculer endTime
  const reservationTime = new Date(data.reservationTime);
  const durationMin = data.durationMin || restaurant.avgMealDurationMin || 90;
  const endTime = new Date(reservationTime.getTime() + durationMin * 60_000);

  // Créer la réservation
  const repo = db.getRepository(Reservation);
  const reservation = repo.create({
    restaurantId,
    customerId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    partySize: data.partySize,
    adults: data.adults || null,
    children: data.children || 0,
    reservationTime,
    endTime,
    durationMin,
    status: data.status || "confirmed",
    notes: data.notes || null,
    allergies: data.allergies || null,
    dietaryRestrictions: data.dietaryRestrictions || null,
    occasion: data.occasion || null,
    serviceId: resolved.serviceId,
    offerId: resolved.offerId,
    diningRoomId: resolved.diningRoomId,
    tableIds: resolved.tableIds,
    source: platform,
    externalId: event.externalId,
    externalRawData: event.rawPayload,
    version: 1,
  } as Partial<Reservation>) as Reservation;

  const saved = await repo.save(reservation);

  // Créer le mapping
  await upsertMapping({
    entityType: "reservation",
    entityId: saved.id,
    platform,
    externalId: event.externalId,
    externalRawData: event.rawPayload,
  });

  await createSyncLog({
    restaurantId,
    entityType: "reservation",
    entityId: saved.id,
    platform,
    externalId: event.externalId,
    direction: "inbound",
    action: "create",
    status: "success",
    requestPayload: event.rawPayload,
    durationMs: Date.now() - startMs,
  });
}

async function handleReservationUpdated(
  platform: string,
  restaurantId: string,
  event: WebhookEvent,
  startMs: number,
): Promise<void> {
  const db = await getDb();
  const data = event.data;

  // Trouver la réservation locale par mapping
  const mapping = await findByExternalId(platform, event.externalId, "reservation");
  if (!mapping) {
    return handleReservationCreated(platform, restaurantId, event, startMs);
  }

  const repo = db.getRepository(Reservation);
  const reservation = await repo.findOneBy({ id: mapping.entityId });
  if (!reservation) {
    return handleReservationCreated(platform, restaurantId, event, startMs);
  }

  // Résoudre les IDs externes → locaux
  const resolved = await resolveExternalIds(platform, data);

  // --- Mastering ---
  const master = getReservationMaster(reservation);

  const remoteData: Record<string, any> = {
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    partySize: data.partySize,
    reservationTime: new Date(data.reservationTime),
    durationMin: data.durationMin,
    notes: data.notes,
    allergies: data.allergies,
    dietaryRestrictions: data.dietaryRestrictions,
    serviceId: resolved.serviceId,
    offerId: resolved.offerId,
    diningRoomId: resolved.diningRoomId,
    tableIds: resolved.tableIds,
  };

  const localData: Record<string, any> = {
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    partySize: reservation.partySize,
    reservationTime: reservation.reservationTime,
    durationMin: reservation.durationMin,
    notes: reservation.notes,
    allergies: reservation.allergies,
    dietaryRestrictions: reservation.dietaryRestrictions,
    serviceId: reservation.serviceId,
    offerId: reservation.offerId,
    diningRoomId: reservation.diningRoomId,
    tableIds: reservation.tableIds,
  };

  const resolution = resolveConflict(
    "reservation",
    restaurantId,
    localData,
    remoteData,
    platform,
    master,
  );

  if (resolution.winner === "local") {
    await createSyncLog({
      restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: event.externalId,
      direction: "inbound",
      action: "update",
      status: "conflict",
      conflictResolution: resolution.description,
      requestPayload: event.rawPayload,
      durationMs: Date.now() - startMs,
    });
    return;
  }

  // Remote gagne — appliquer les données fusionnées
  const merged = resolution.merged;
  const endTime = merged.reservationTime instanceof Date
    ? new Date(merged.reservationTime.getTime() + (merged.durationMin || 90) * 60_000)
    : reservation.endTime;

  await repo.update(reservation.id, {
    customerName: merged.customerName,
    customerPhone: merged.customerPhone,
    partySize: merged.partySize,
    reservationTime: merged.reservationTime,
    durationMin: merged.durationMin,
    endTime,
    notes: merged.notes,
    allergies: merged.allergies,
    dietaryRestrictions: merged.dietaryRestrictions,
    serviceId: merged.serviceId ?? reservation.serviceId,
    offerId: merged.offerId ?? reservation.offerId,
    diningRoomId: merged.diningRoomId ?? reservation.diningRoomId,
    tableIds: merged.tableIds ?? reservation.tableIds,
    externalRawData: event.rawPayload,
    version: reservation.version + 1,
  });

  await upsertMapping({
    entityType: "reservation",
    entityId: reservation.id,
    platform,
    externalId: event.externalId,
    externalRawData: event.rawPayload,
  });

  await createSyncLog({
    restaurantId,
    entityType: "reservation",
    entityId: reservation.id,
    platform,
    externalId: event.externalId,
    direction: "inbound",
    action: "update",
    status: "success",
    conflictResolution: resolution.description,
    requestPayload: event.rawPayload,
    durationMs: Date.now() - startMs,
  });
}

async function handleReservationCancelled(
  platform: string,
  restaurantId: string,
  event: WebhookEvent,
  startMs: number,
): Promise<void> {
  const db = await getDb();

  const mapping = await findByExternalId(platform, event.externalId, "reservation");
  if (!mapping) {
    await createSyncLog({
      restaurantId,
      entityType: "reservation",
      platform,
      externalId: event.externalId,
      direction: "inbound",
      action: "cancel",
      status: "skipped",
      conflictResolution: "No local reservation found for this external ID",
      requestPayload: event.rawPayload,
      durationMs: Date.now() - startMs,
    });
    return;
  }

  const repo = db.getRepository(Reservation);
  const reservation = await repo.findOneBy({ id: mapping.entityId });
  if (!reservation) return;

  // Mastering : si la réservation est seated/completed, on refuse l'annulation
  const master = getReservationMaster(reservation);
  if (master === "self" && ["seated", "completed"].includes(reservation.status)) {
    await createSyncLog({
      restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: event.externalId,
      direction: "inbound",
      action: "cancel",
      status: "conflict",
      conflictResolution: `Local status is "${reservation.status}" (self is master), cancel ignored`,
      requestPayload: event.rawPayload,
      durationMs: Date.now() - startMs,
    });
    return;
  }

  await repo.update(reservation.id, {
    status: "cancelled",
    cancelReason: `Cancelled from ${platform}`,
    cancelActor: platform,
    version: reservation.version + 1,
  });

  await createSyncLog({
    restaurantId,
    entityType: "reservation",
    entityId: reservation.id,
    platform,
    externalId: event.externalId,
    direction: "inbound",
    action: "cancel",
    status: "success",
    requestPayload: event.rawPayload,
    durationMs: Date.now() - startMs,
  });
}

async function handleReservationStatusChanged(
  platform: string,
  restaurantId: string,
  event: WebhookEvent,
  startMs: number,
): Promise<void> {
  const db = await getDb();

  const mapping = await findByExternalId(platform, event.externalId, "reservation");
  if (!mapping) return;

  const repo = db.getRepository(Reservation);
  const reservation = await repo.findOneBy({ id: mapping.entityId });
  if (!reservation) return;

  const newStatus = event.data.status;
  if (!newStatus || newStatus === reservation.status) return;

  // Mastering
  const master = getReservationMaster(reservation);
  if (master === "self") {
    await createSyncLog({
      restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: event.externalId,
      direction: "inbound",
      action: "status_change",
      status: "conflict",
      conflictResolution: `Self is master (status="${reservation.status}"), remote status "${newStatus}" ignored`,
      requestPayload: event.rawPayload,
      durationMs: Date.now() - startMs,
    });
    return;
  }

  await repo.update(reservation.id, {
    status: newStatus,
    version: reservation.version + 1,
  });

  await createSyncLog({
    restaurantId,
    entityType: "reservation",
    entityId: reservation.id,
    platform,
    externalId: event.externalId,
    direction: "inbound",
    action: "status_change",
    status: "success",
    requestPayload: event.rawPayload,
    durationMs: Date.now() - startMs,
  });
}

// ---------------------------------------------------------------------------
// External ID → Local ID resolver
// ---------------------------------------------------------------------------

/**
 * Résout les IDs externes (service, offre, salle, tables) en IDs locaux via SyncExternalMapping.
 */
async function resolveExternalIds(
  platform: string,
  data: Record<string, any>,
): Promise<{
  serviceId: string | null;
  offerId: string | null;
  diningRoomId: string | null;
  tableIds: string[] | null;
}> {
  let serviceId: string | null = null;
  let offerId: string | null = null;
  let diningRoomId: string | null = null;
  let tableIds: string[] | null = null;

  if (data.serviceExternalId) {
    const m = await findByExternalId(platform, data.serviceExternalId, "dining_service");
    if (m) serviceId = m.entityId;
  }
  if (data.offerExternalId) {
    const m = await findByExternalId(platform, data.offerExternalId, "offer");
    if (m) offerId = m.entityId;
  }
  if (data.diningRoomExternalId) {
    const m = await findByExternalId(platform, data.diningRoomExternalId, "dining_room");
    if (m) diningRoomId = m.entityId;
  }
  if (data.tableExternalIds && Array.isArray(data.tableExternalIds)) {
    const ids: string[] = [];
    for (const extId of data.tableExternalIds) {
      const m = await findByExternalId(platform, extId, "table");
      if (m) ids.push(m.entityId);
    }
    if (ids.length > 0) tableIds = ids;
  }

  return { serviceId, offerId, diningRoomId, tableIds };
}

// ---------------------------------------------------------------------------
// Customer helper
// ---------------------------------------------------------------------------

async function upsertCustomer(
  restaurantId: string,
  data: Record<string, any>,
): Promise<string | null> {
  if (!data.customerPhone) return null;

  const db = await getDb();
  const repo = db.getRepository(Customer);

  let customer = await repo.findOneBy({
    phone: data.customerPhone,
  });

  if (customer) {
    let needsUpdate = false;
    if (data.customerName && !customer.firstName) {
      const parts = data.customerName.split(" ");
      customer.firstName = parts[0] || null;
      customer.lastName = parts.slice(1).join(" ") || null;
      needsUpdate = true;
    }
    if (data.customerEmail && !customer.email) {
      customer.email = data.customerEmail;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await repo.save(customer);
    }
    return customer.id;
  }

  // Créer un nouveau client
  const parts = (data.customerName || "").split(" ");
  const newCustomer = repo.create({
    restaurantId,
    phone: data.customerPhone,
    firstName: parts[0] || null,
    lastName: parts.slice(1).join(" ") || null,
    email: data.customerEmail || null,
    locale: "fr",
  } as Partial<Customer>) as Customer;

  const saved = await repo.save(newCustomer);
  return saved.id;
}
