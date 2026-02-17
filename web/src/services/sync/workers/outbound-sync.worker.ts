/**
 * Outbound sync — propage les modifications locales vers les plateformes externes.
 */
import { getDb } from "@/lib/db";
import type { Reservation } from "@/db/entities/Reservation";
import type { Order } from "@/db/entities/Order";
import type { SyncPlatformConfig } from "@/db/entities/SyncPlatformConfig";
import { getConnector } from "../connectors/connector.registry";
import { ZenchefConnector } from "../connectors/zenchef/zenchef.connector";
import { findMapping, upsertMapping, findMappingsForEntity } from "../external-mapping.service";
import { createSyncLog, scheduleRetry } from "../sync-log.service";
import { getReservationMaster } from "../mastering.service";
import { reservationToDTO } from "../connectors/zenchef/zenchef.mapper";
import type { SyncAction } from "@/db/entities/SyncLog";

// ======================================================================
// RESERVATIONS
// ======================================================================

/**
 * Sync une réservation vers toutes les plateformes connectées.
 * Appelé après POST/PATCH sur /api/reservations.
 * Respecte les règles de mastering.
 */
export async function syncReservationOutbound(
  reservation: Reservation,
  action: SyncAction = "update",
): Promise<void> {
  const db = await getDb();

  // Plateformes déjà mappées (update)
  const mappings = await findMappingsForEntity("reservation", reservation.id);
  const platformsToSync = new Set<string>(mappings.map((m) => m.platform));

  // Pour les nouvelles réservations, push vers toutes les configs actives qui sync "reservation"
  if (action === "create") {
    const configs = await db.getRepository<SyncPlatformConfig>("sync_platform_configs").find({
      where: { restaurantId: reservation.restaurantId, isActive: true },
    });
    for (const c of configs) {
      if (c.syncEntities.includes("reservation")) {
        platformsToSync.add(c.platform);
      }
    }
  }

  for (const platform of platformsToSync) {
    await syncReservationToPlatform(reservation, platform, action);
  }
}

async function syncReservationToPlatform(
  reservation: Reservation,
  platform: string,
  action: SyncAction,
): Promise<void> {
  const startMs = Date.now();

  // --- Mastering check ---
  const master = getReservationMaster(reservation);
  if (master === platform) {
    // La plateforme est master → on ne push pas vers elle
    await createSyncLog({
      restaurantId: reservation.restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      direction: "outbound",
      action,
      status: "skipped",
      durationMs: Date.now() - startMs,
      conflictResolution: `Skipped: ${platform} is master for this reservation`,
    });
    return;
  }

  const mapping = await findMapping("reservation", reservation.id, platform);
  const externalId = mapping?.externalId || reservation.externalId;
  const dto = await reservationToDTO(reservation, platform);

  try {
    const connector = await getConnector(platform, reservation.restaurantId);

    // --- Cancel / No-show ---
    if (action === "cancel" || reservation.status === "cancelled" || reservation.status === "no_show") {
      if (externalId) {
        await connector.cancelReservation(externalId, reservation.cancelReason || undefined);
        await createSyncLog({
          restaurantId: reservation.restaurantId,
          entityType: "reservation",
          entityId: reservation.id,
          platform,
          externalId,
          direction: "outbound",
          action: "cancel",
          status: "success",
          durationMs: Date.now() - startMs,
        });
      }
      return;
    }

    // --- Checkin / Checkout (spécifique Zenchef) ---
    if (platform === "zenchef" && externalId && connector instanceof ZenchefConnector) {
      if (reservation.status === "seated") {
        await connector.checkinBooking(externalId);
        await createSyncLog({
          restaurantId: reservation.restaurantId,
          entityType: "reservation",
          entityId: reservation.id,
          platform,
          externalId,
          direction: "outbound",
          action: "status_change",
          status: "success",
          requestPayload: { action: "checkin" },
          durationMs: Date.now() - startMs,
        });
        return;
      }
      if (reservation.status === "completed") {
        await connector.checkoutBooking(externalId);
        await createSyncLog({
          restaurantId: reservation.restaurantId,
          entityType: "reservation",
          entityId: reservation.id,
          platform,
          externalId,
          direction: "outbound",
          action: "status_change",
          status: "success",
          requestPayload: { action: "checkout" },
          durationMs: Date.now() - startMs,
        });
        return;
      }
    }

    // --- Create / Update ---
    let result;
    if (externalId) {
      result = await connector.updateReservation(externalId, dto);
      action = "update";
    } else {
      result = await connector.createReservation(dto);
      action = "create";
    }

    // Mettre à jour le mapping
    await upsertMapping({
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: result.externalId,
      externalRawData: result.rawData,
      syncStatus: "synced",
    });

    // Stocker l'externalId sur l'entité si pas encore renseigné
    if (!reservation.externalId) {
      const db = await getDb();
      await db.getRepository<Reservation>("reservations").update(reservation.id, {
        externalId: result.externalId,
        externalRawData: result.rawData,
      });
    }

    await createSyncLog({
      restaurantId: reservation.restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: result.externalId,
      direction: "outbound",
      action,
      status: "success",
      requestPayload: dto as unknown as Record<string, any>,
      responsePayload: result.rawData,
      durationMs: Date.now() - startMs,
    });
  } catch (err: any) {
    const log = await createSyncLog({
      restaurantId: reservation.restaurantId,
      entityType: "reservation",
      entityId: reservation.id,
      platform,
      externalId: externalId || null,
      direction: "outbound",
      action,
      status: "failed",
      errorMessage: err.message || String(err),
      requestPayload: dto as unknown as Record<string, any>,
      durationMs: Date.now() - startMs,
    });
    await scheduleRetry(log.id);
  }
}

// ======================================================================
// ORDERS
// ======================================================================

/**
 * Sync une commande vers sa plateforme d'origine.
 * Les commandes sont généralement inbound (plateforme → nous) ;
 * on ne sync que les mises à jour de statut en retour.
 */
export async function syncOrderOutbound(order: Order): Promise<void> {
  const platform = order.source;
  const externalId = order.externalId;
  if (!externalId) return;

  const startMs = Date.now();

  const payload = {
    externalId,
    status: order.status,
    items: order.items?.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
    total: Number(order.total),
    estimatedReadyAt: order.estimatedReadyAt,
    notes: order.notes,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
  };

  try {
    const connector = await getConnector(platform, order.restaurantId);
    await connector.syncEntity("order", payload, externalId);

    await createSyncLog({
      restaurantId: order.restaurantId,
      entityType: "order",
      entityId: order.id,
      platform,
      externalId,
      direction: "outbound",
      action: "update",
      status: "success",
      requestPayload: payload,
      durationMs: Date.now() - startMs,
    });
  } catch (err: any) {
    const log = await createSyncLog({
      restaurantId: order.restaurantId,
      entityType: "order",
      entityId: order.id,
      platform,
      externalId,
      direction: "outbound",
      action: "update",
      status: "failed",
      errorMessage: err.message || String(err),
      requestPayload: payload,
      durationMs: Date.now() - startMs,
    });
    await scheduleRetry(log.id);
  }
}

// ======================================================================
// MENU ITEMS
// ======================================================================

/**
 * Sync les items du menu vers toutes les plateformes connectées.
 */
export async function syncMenuOutbound(
  restaurantId: string,
  items: { id: string; name: string; description?: string; price: number; categoryName?: string; isAvailable: boolean; allergens?: string[]; imageUrl?: string }[],
): Promise<void> {
  const db = await getDb();
  const configs = await db.getRepository<SyncPlatformConfig>("sync_platform_configs").find({
    where: { restaurantId, isActive: true },
  });

  for (const config of configs) {
    if (!config.syncEntities.includes("menu_item")) continue;

    const startMs = Date.now();
    try {
      const connector = await getConnector(config.platform, restaurantId);
      if (!connector.pushMenuItems) continue;

      const results = await connector.pushMenuItems(items);
      for (let i = 0; i < results.length; i++) {
        await upsertMapping({
          entityType: "menu_item",
          entityId: items[i].id,
          platform: config.platform,
          externalId: results[i].externalId,
          externalRawData: results[i].rawData,
          syncStatus: "synced",
        });
      }

      await createSyncLog({
        restaurantId,
        entityType: "menu_item",
        platform: config.platform,
        direction: "outbound",
        action: "update",
        status: "success",
        requestPayload: { itemCount: items.length },
        durationMs: Date.now() - startMs,
      });
    } catch (err: any) {
      const log = await createSyncLog({
        restaurantId,
        entityType: "menu_item",
        platform: config.platform,
        direction: "outbound",
        action: "update",
        status: "failed",
        errorMessage: err.message || String(err),
        durationMs: Date.now() - startMs,
      });
      await scheduleRetry(log.id);
    }
  }
}

// ======================================================================
// TABLES & SALLES
// ======================================================================

/**
 * Sync le plan de salle vers toutes les plateformes connectées.
 */
export async function syncTablesOutbound(
  restaurantId: string,
  tables: { id: string; label: string; seats: number; diningRoomName?: string; isActive: boolean }[],
): Promise<void> {
  const db = await getDb();
  const configs = await db.getRepository<SyncPlatformConfig>("sync_platform_configs").find({
    where: { restaurantId, isActive: true },
  });

  for (const config of configs) {
    if (!config.syncEntities.includes("table")) continue;

    const startMs = Date.now();
    try {
      const connector = await getConnector(config.platform, restaurantId);
      if (!connector.pushTables) continue;

      const results = await connector.pushTables(tables);
      for (let i = 0; i < results.length; i++) {
        await upsertMapping({
          entityType: "table",
          entityId: tables[i].id,
          platform: config.platform,
          externalId: results[i].externalId,
          externalRawData: results[i].rawData,
          syncStatus: "synced",
        });
      }

      await createSyncLog({
        restaurantId,
        entityType: "table",
        platform: config.platform,
        direction: "outbound",
        action: "update",
        status: "success",
        requestPayload: { tableCount: tables.length },
        durationMs: Date.now() - startMs,
      });
    } catch (err: any) {
      const log = await createSyncLog({
        restaurantId,
        entityType: "table",
        platform: config.platform,
        direction: "outbound",
        action: "update",
        status: "failed",
        errorMessage: err.message || String(err),
        durationMs: Date.now() - startMs,
      });
      await scheduleRetry(log.id);
    }
  }
}

// ======================================================================
// CUSTOMERS
// ======================================================================

/**
 * Sync un client vers les plateformes connectées.
 */
export async function syncCustomerOutbound(
  restaurantId: string,
  customer: { id: string; firstName?: string; lastName?: string; phone?: string; email?: string; locale?: string },
): Promise<void> {
  const db = await getDb();
  const configs = await db.getRepository<SyncPlatformConfig>("sync_platform_configs").find({
    where: { restaurantId, isActive: true },
  });

  for (const config of configs) {
    if (!config.syncEntities.includes("customer")) continue;

    const startMs = Date.now();
    const existingMapping = await findMapping("customer", customer.id, config.platform);

    try {
      const connector = await getConnector(config.platform, restaurantId);
      if (!connector.syncCustomer) continue;

      const result = await connector.syncCustomer(
        existingMapping?.externalId || null,
        customer,
      );

      await upsertMapping({
        entityType: "customer",
        entityId: customer.id,
        platform: config.platform,
        externalId: result.externalId,
        externalRawData: result.rawData,
        syncStatus: "synced",
      });

      await createSyncLog({
        restaurantId,
        entityType: "customer",
        entityId: customer.id,
        platform: config.platform,
        externalId: result.externalId,
        direction: "outbound",
        action: existingMapping ? "update" : "create",
        status: "success",
        durationMs: Date.now() - startMs,
      });
    } catch (err: any) {
      const log = await createSyncLog({
        restaurantId,
        entityType: "customer",
        entityId: customer.id,
        platform: config.platform,
        direction: "outbound",
        action: "update",
        status: "failed",
        errorMessage: err.message || String(err),
        durationMs: Date.now() - startMs,
      });
      await scheduleRetry(log.id);
    }
  }
}
