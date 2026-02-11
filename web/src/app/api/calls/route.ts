import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Call } from "@/db/entities/Call";

// GET /api/calls?restaurantId=xxx&limit=20
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Cleanup: marquer abandoned les appels in_progress dépassant MAX_CALL_DURATION
  const maxDuration = parseInt(process.env.MAX_CALL_DURATION || "600");
  const cutoff = new Date(Date.now() - maxDuration * 1000);
  const repo = ds.getRepository(Call);
  const stale = await repo.find({
    where: { restaurantId, outcome: "in_progress" },
  });
  for (const call of stale) {
    if (new Date(call.startedAt) < cutoff) {
      await repo.update(call.id, {
        outcome: "abandoned",
        endedAt: new Date(new Date(call.startedAt).getTime() + maxDuration * 1000),
        durationSec: maxDuration,
      });
    }
  }

  const calls = await repo.find({
    where: { restaurantId },
    relations: ["customer"],
    order: { startedAt: "DESC" },
    take: limit,
  });

  return NextResponse.json(calls);
}

// POST /api/calls — créer un log d'appel (appelé par SIP service)
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const call = ds.getRepository(Call).create({
    ...body,
    startedAt: body.startedAt || new Date(),
  } as Partial<Call>) as Call;

  const saved = await ds.getRepository(Call).save(call);
  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/calls — mettre à jour un appel (fin d'appel, outcome, transcript)
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await ds.getRepository(Call).update(id, updates);
  const updated = await ds.getRepository(Call).findOneBy({ id });

  return NextResponse.json(updated);
}
