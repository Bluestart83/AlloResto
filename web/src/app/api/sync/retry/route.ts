/**
 * POST /api/sync/retry — déclenche le traitement des retries en attente.
 * GET  /api/sync/retry — retourne le nombre de retries en attente.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SyncLog } from "@/db/entities/SyncLog";
import { processRetries } from "@/services/sync/workers/retry.worker";

export async function POST(req: NextRequest) {
  let limit = 50;
  try {
    const body = await req.json();
    if (body.limit && typeof body.limit === "number") {
      limit = Math.min(body.limit, 200);
    }
  } catch {
    // Pas de body ou JSON invalide → défaut
  }

  const result = await processRetries(limit);
  return NextResponse.json(result);
}

export async function GET() {
  const db = await getDb();
  const count = await db.getRepository(SyncLog).count({
    where: { status: "retry" as any },
  });
  return NextResponse.json({ pendingRetries: count });
}
