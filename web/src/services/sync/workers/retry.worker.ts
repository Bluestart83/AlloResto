/**
 * Retry worker — traite les syncs échouées avec exponential backoff.
 */
import { getDb } from "@/lib/db";
import { SyncLog } from "@/db/entities/SyncLog";
import { Reservation } from "@/db/entities/Reservation";
import { Order } from "@/db/entities/Order";
import { getPendingRetries } from "../sync-log.service";
import { isSupportedPlatform } from "../connectors/connector.registry";
import { syncReservationOutbound, syncOrderOutbound } from "./outbound-sync.worker";
import type { SyncAction } from "@/db/entities/SyncLog";

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Traite tous les retries en attente.
 * Appeler depuis un cron ou manuellement.
 */
export async function processRetries(limit = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const logs = await getPendingRetries(limit);
  let succeeded = 0;
  let failed = 0;

  for (const log of logs) {
    try {
      await retryOneLog(log);
      succeeded++;
    } catch (err: any) {
      console.error(`[retry] Failed to retry log ${log.id}:`, err.message);
      failed++;
    }
  }

  return { processed: logs.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function retryOneLog(log: SyncLog): Promise<void> {
  const db = await getDb();

  if (!isSupportedPlatform(log.platform)) {
    await db.getRepository(SyncLog).update(log.id, {
      status: "failed",
      errorMessage: `Platform "${log.platform}" not supported`,
    });
    return;
  }

  if (log.direction === "outbound") {
    await retryOutbound(log);
  } else {
    await retryInbound(log);
  }
}

async function retryOutbound(log: SyncLog): Promise<void> {
  const db = await getDb();

  if (log.entityType === "reservation" && log.entityId) {
    const reservation = await db.getRepository(Reservation).findOneBy({
      id: log.entityId,
    });
    if (!reservation) {
      await markLogFailed(log.id, "Reservation not found");
      return;
    }
    await syncReservationOutbound(reservation, (log.action || "update") as SyncAction);
    await markLogSucceeded(log.id);
  } else if (log.entityType === "order" && log.entityId) {
    const order = await db.getRepository(Order).findOne({
      where: { id: log.entityId },
      relations: ["items"],
    });
    if (!order) {
      await markLogFailed(log.id, "Order not found");
      return;
    }
    await syncOrderOutbound(order);
    await markLogSucceeded(log.id);
  } else {
    await markLogFailed(log.id, `Unknown entity type: ${log.entityType}`);
  }
}

async function retryInbound(log: SyncLog): Promise<void> {
  if (!log.requestPayload) {
    await markLogFailed(log.id, "No stored requestPayload to retry");
    return;
  }

  const { processInboundWebhook } = await import("./inbound-sync.worker");
  await processInboundWebhook({
    platform: log.platform,
    restaurantId: log.restaurantId,
    headers: {},
    body: log.requestPayload,
    webhookSecret: null, // Skip la validation signature au retry
  });

  await markLogSucceeded(log.id);
}

async function markLogSucceeded(logId: string): Promise<void> {
  const db = await getDb();
  await db.getRepository(SyncLog).update(logId, { status: "success" });
}

async function markLogFailed(logId: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.getRepository(SyncLog).update(logId, {
    status: "failed",
    errorMessage: reason,
  });
}
