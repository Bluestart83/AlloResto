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

  const calls = await ds.getRepository(Call).find({
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
