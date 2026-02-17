/**
 * CRUD pour SyncExternalMapping.
 * Lie une entité interne à son équivalent sur une plateforme.
 */
import { getDb } from "@/lib/db";
import type { SyncExternalMapping } from "@/db/entities/SyncExternalMapping";

/**
 * Trouve le mapping pour une entité locale sur une plateforme donnée.
 */
export async function findMapping(
  entityType: string,
  entityId: string,
  platform: string,
): Promise<SyncExternalMapping | null> {
  const db = await getDb();
  return db.getRepository<SyncExternalMapping>("sync_external_mappings").findOneBy({ entityType, entityId, platform });
}

/**
 * Trouve l'entité locale correspondant à un ID externe.
 */
export async function findByExternalId(
  platform: string,
  externalId: string,
  entityType?: string,
): Promise<SyncExternalMapping | null> {
  const db = await getDb();
  const where: Record<string, any> = { platform, externalId };
  if (entityType) where.entityType = entityType;
  return db.getRepository<SyncExternalMapping>("sync_external_mappings").findOneBy(where);
}

/**
 * Trouve tous les mappings pour une entité locale (sur quelles plateformes existe-t-elle ?).
 */
export async function findMappingsForEntity(
  entityType: string,
  entityId: string,
): Promise<SyncExternalMapping[]> {
  const db = await getDb();
  return db.getRepository<SyncExternalMapping>("sync_external_mappings").findBy({ entityType, entityId });
}

/**
 * Crée ou met à jour un mapping.
 */
export async function upsertMapping(params: {
  entityType: string;
  entityId: string;
  platform: string;
  externalId: string;
  externalSecondaryId?: string | null;
  externalRawData?: Record<string, any> | null;
  syncStatus?: string;
}): Promise<SyncExternalMapping> {
  const db = await getDb();
  const repo = db.getRepository<SyncExternalMapping>("sync_external_mappings");

  let mapping = await repo.findOneBy({
    entityType: params.entityType,
    entityId: params.entityId,
    platform: params.platform,
  });

  if (mapping) {
    mapping.externalId = params.externalId;
    if (params.externalSecondaryId !== undefined)
      mapping.externalSecondaryId = params.externalSecondaryId ?? null;
    if (params.externalRawData !== undefined)
      mapping.externalRawData = params.externalRawData ?? null;
    mapping.syncStatus = params.syncStatus ?? "synced";
    mapping.syncedAt = new Date();
    return repo.save(mapping);
  }

  mapping = repo.create({
    entityType: params.entityType,
    entityId: params.entityId,
    platform: params.platform,
    externalId: params.externalId,
    externalSecondaryId: params.externalSecondaryId ?? null,
    externalRawData: params.externalRawData ?? null,
    syncStatus: params.syncStatus ?? "synced",
    syncedAt: new Date(),
  } as Partial<SyncExternalMapping>) as SyncExternalMapping;

  return repo.save(mapping);
}

/**
 * Met à jour le statut d'un mapping.
 */
export async function updateMappingStatus(
  id: string,
  syncStatus: string,
): Promise<void> {
  const db = await getDb();
  await db.getRepository<SyncExternalMapping>("sync_external_mappings").update(id, {
    syncStatus,
    syncedAt: syncStatus === "synced" ? new Date() : undefined,
  });
}

/**
 * Supprime un mapping.
 */
export async function deleteMapping(
  entityType: string,
  entityId: string,
  platform: string,
): Promise<void> {
  const db = await getDb();
  await db.getRepository<SyncExternalMapping>("sync_external_mappings").delete({ entityType, entityId, platform });
}
