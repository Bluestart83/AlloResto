/**
 * POST /api/webhooks/zenchef — réception des webhooks Zenchef.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SyncPlatformConfig } from "@/db/entities/SyncPlatformConfig";
import { processInboundWebhook } from "@/services/sync/workers/inbound-sync.worker";
import { createSyncLog } from "@/services/sync/sync-log.service";

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Identifier le restaurant via restaurant_uid dans le payload
  const restaurantUid = body.restaurant_uid;
  if (!restaurantUid) {
    return NextResponse.json({ error: "Missing restaurant_uid" }, { status: 400 });
  }

  // Trouver la SyncPlatformConfig qui correspond
  const db = await getDb();
  const configs = await db.getRepository(SyncPlatformConfig).find({
    where: { platform: "zenchef", isActive: true },
  });

  const config = configs.find(
    (c) => c.credentials?.restaurantUid === restaurantUid,
  );

  if (!config) {
    return NextResponse.json({ error: "Unknown restaurant_uid" }, { status: 404 });
  }

  // Collecter les headers pour la validation signature
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    await processInboundWebhook({
      platform: "zenchef",
      restaurantId: config.restaurantId,
      headers,
      body,
      webhookSecret: config.webhookSecret,
    });
  } catch (err: any) {
    // Signature invalide → 401
    if (err.message?.includes("signature")) {
      await createSyncLog({
        restaurantId: config.restaurantId,
        entityType: "reservation",
        platform: "zenchef",
        direction: "inbound",
        action: "create",
        status: "failed",
        errorMessage: err.message,
        requestPayload: body,
        durationMs: Date.now() - startMs,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    console.error("[webhook/zenchef] processing error:", err);
    // On retourne 200 quand même pour éviter les retries infinis de Zenchef
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
