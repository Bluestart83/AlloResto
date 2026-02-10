/**
 * Service d'écriture des SyncLogs.
 * Chaque échange avec une plateforme est journalisé pour audit, debug, et retry.
 */
import { getDb } from "@/lib/db";
import { SyncLog } from "@/db/entities/SyncLog";
import type { SyncDirection, SyncAction, SyncStatus } from "@/db/entities/SyncLog";

export interface CreateSyncLogParams {
  restaurantId: string;
  entityType: string;
  entityId?: string | null;
  platform: string;
  externalId?: string | null;
  direction: SyncDirection;
  action: SyncAction;
  status?: SyncStatus;
  requestPayload?: Record<string, any> | null;
  responsePayload?: Record<string, any> | null;
  errorMessage?: string | null;
  conflictResolution?: string | null;
  durationMs?: number | null;
}

// Exponential backoff delays in minutes: 1, 5, 30, 120, 480
const RETRY_DELAYS_MIN = [1, 5, 30, 120, 480];
const MAX_RETRIES = 5;

/**
 * Écrit un log de synchronisation.
 */
export async function createSyncLog(params: CreateSyncLogParams): Promise<SyncLog> {
  const db = await getDb();
  const repo = db.getRepository(SyncLog);

  const log = repo.create({
    restaurantId: params.restaurantId,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    platform: params.platform,
    externalId: params.externalId ?? null,
    direction: params.direction,
    action: params.action,
    status: params.status ?? "success",
    requestPayload: params.requestPayload ?? null,
    responsePayload: params.responsePayload ?? null,
    errorMessage: params.errorMessage ?? null,
    conflictResolution: params.conflictResolution ?? null,
    durationMs: params.durationMs ?? null,
  } as Partial<SyncLog>) as SyncLog;

  return repo.save(log);
}

/**
 * Marque un log en retry avec exponential backoff.
 * Retourne false si le max de retries est atteint (passe en "failed").
 */
export async function scheduleRetry(logId: string): Promise<boolean> {
  const db = await getDb();
  const repo = db.getRepository(SyncLog);

  const log = await repo.findOneBy({ id: logId });
  if (!log) return false;

  if (log.retryCount >= MAX_RETRIES) {
    await repo.update(logId, { status: "failed" });
    return false;
  }

  const delayMin = RETRY_DELAYS_MIN[Math.min(log.retryCount, RETRY_DELAYS_MIN.length - 1)];
  const nextRetry = new Date(Date.now() + delayMin * 60_000);

  await repo.update(logId, {
    status: "retry",
    retryCount: log.retryCount + 1,
    nextRetryAt: nextRetry,
  });

  return true;
}

/**
 * Récupère les logs en attente de retry dont l'heure est passée.
 */
export async function getPendingRetries(limit = 50): Promise<SyncLog[]> {
  const db = await getDb();
  const repo = db.getRepository(SyncLog);

  return repo
    .createQueryBuilder("log")
    .where("log.status = :status", { status: "retry" })
    .andWhere("log.nextRetryAt <= :now", { now: new Date() })
    .orderBy("log.nextRetryAt", "ASC")
    .limit(limit)
    .getMany();
}
