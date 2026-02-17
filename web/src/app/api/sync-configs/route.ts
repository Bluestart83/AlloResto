import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { SyncPlatformConfig } from "@/db/entities/SyncPlatformConfig";
import { clearConnectorCache } from "@/services/sync/connectors/connector.registry";

// ---------------------------------------------------------------------------
// GET /api/sync-configs?restaurantId=xxx
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const db = await getDb();
  const configs = await db.getRepository<SyncPlatformConfig>("sync_platform_configs").find({
    where: { restaurantId },
    order: { platform: "ASC" },
  });

  // Masquer les credentials sensibles
  const safe = configs.map((c) => ({
    id: c.id,
    platform: c.platform,
    hasCredentials: Object.keys(c.credentials || {}).length > 0,
    credentialKeys: Object.keys(c.credentials || {}),
    masterFor: c.masterFor,
    syncEntities: c.syncEntities,
    supportsWebhook: c.supportsWebhook,
    webhookUrl: c.webhookUrl,
    webhookSecret: c.webhookSecret ? "••••••" : null,
    pollIntervalSec: c.pollIntervalSec,
    isActive: c.isActive,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
  }));

  return NextResponse.json(safe);
}

// ---------------------------------------------------------------------------
// POST /api/sync-configs — create
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantId,
    platform,
    credentials,
    masterFor,
    syncEntities,
    supportsWebhook,
    webhookSecret,
    pollIntervalSec,
  } = body;

  if (!restaurantId || !platform) {
    return NextResponse.json({ error: "restaurantId and platform required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<SyncPlatformConfig>("sync_platform_configs");

  // Contrainte unique
  const existing = await repo.findOneBy({ restaurantId, platform });
  if (existing) {
    return NextResponse.json(
      { error: `Une intégration ${platform} existe déjà pour ce restaurant` },
      { status: 409 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://localhost:3000";
  const webhookUrl = `${baseUrl}/api/webhooks/${platform}`;

  const config = repo.create({
    restaurantId,
    platform,
    credentials: credentials || {},
    masterFor: masterFor || [],
    syncEntities: syncEntities || ["reservation"],
    supportsWebhook: supportsWebhook ?? false,
    webhookUrl,
    webhookSecret: webhookSecret || null,
    pollIntervalSec: pollIntervalSec || 300,
    isActive: true,
  } as Partial<SyncPlatformConfig>) as SyncPlatformConfig;

  const saved = await repo.save(config);
  clearConnectorCache(restaurantId, platform);

  return NextResponse.json({
    id: saved.id,
    platform: saved.platform,
    hasCredentials: Object.keys(saved.credentials || {}).length > 0,
    credentialKeys: Object.keys(saved.credentials || {}),
    masterFor: saved.masterFor,
    syncEntities: saved.syncEntities,
    supportsWebhook: saved.supportsWebhook,
    webhookUrl: saved.webhookUrl,
    webhookSecret: saved.webhookSecret ? "••••••" : null,
    pollIntervalSec: saved.pollIntervalSec,
    isActive: saved.isActive,
    lastSyncAt: saved.lastSyncAt,
    lastError: saved.lastError,
    createdAt: saved.createdAt,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/sync-configs — update
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<SyncPlatformConfig>("sync_platform_configs");
  const config = await repo.findOneBy({ id });
  if (!config) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  // Credentials : ne mettre à jour que si envoyées et non vides
  if (fields.credentials && Object.keys(fields.credentials).length > 0) {
    config.credentials = fields.credentials;
  }
  if (fields.masterFor !== undefined) config.masterFor = fields.masterFor;
  if (fields.syncEntities !== undefined) config.syncEntities = fields.syncEntities;
  if (fields.supportsWebhook !== undefined) config.supportsWebhook = fields.supportsWebhook;
  if (fields.webhookSecret !== undefined) config.webhookSecret = fields.webhookSecret || null;
  if (fields.pollIntervalSec !== undefined) config.pollIntervalSec = fields.pollIntervalSec;
  if (fields.isActive !== undefined) config.isActive = fields.isActive;

  const saved = await repo.save(config);
  clearConnectorCache(config.restaurantId, config.platform);

  return NextResponse.json({
    id: saved.id,
    platform: saved.platform,
    hasCredentials: Object.keys(saved.credentials || {}).length > 0,
    credentialKeys: Object.keys(saved.credentials || {}),
    masterFor: saved.masterFor,
    syncEntities: saved.syncEntities,
    supportsWebhook: saved.supportsWebhook,
    webhookUrl: saved.webhookUrl,
    webhookSecret: saved.webhookSecret ? "••••••" : null,
    pollIntervalSec: saved.pollIntervalSec,
    isActive: saved.isActive,
    lastSyncAt: saved.lastSyncAt,
    lastError: saved.lastError,
    createdAt: saved.createdAt,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/sync-configs?id=xxx
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<SyncPlatformConfig>("sync_platform_configs");
  const config = await repo.findOneBy({ id });
  if (!config) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  await repo.remove(config);
  clearConnectorCache(config.restaurantId, config.platform);

  return NextResponse.json({ ok: true });
}
