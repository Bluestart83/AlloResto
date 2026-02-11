import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DiningService } from "@/db/entities/DiningService";

// GET /api/dining-services?restaurantId=X
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const db = await getDb();
  const services = await db.getRepository(DiningService).find({
    where: { restaurantId },
    order: { displayOrder: "ASC", name: "ASC" },
  });

  return NextResponse.json(services);
}

// POST /api/dining-services
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.restaurantId || !body.name || !body.startTime || !body.endTime || !body.dayOfWeek || body.maxCovers == null) {
    return NextResponse.json(
      { error: "restaurantId, name, dayOfWeek, startTime, endTime, maxCovers required" },
      { status: 400 },
    );
  }

  const db = await getDb();
  const repo = db.getRepository(DiningService);
  const service = repo.create({
    restaurantId: body.restaurantId,
    name: body.name,
    type: body.type || "standard",
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    lastSeatingTime: body.lastSeatingTime || null,
    maxCovers: body.maxCovers,
    minPartySize: body.minPartySize ?? 1,
    maxPartySize: body.maxPartySize ?? null,
    slotIntervalMin: body.slotIntervalMin ?? 30,
    defaultDurationMin: body.defaultDurationMin ?? 90,
    requiresPrepayment: body.requiresPrepayment ?? false,
    prepaymentAmount: body.prepaymentAmount ?? null,
    autoConfirm: body.autoConfirm ?? true,
    diningRoomIds: body.diningRoomIds ?? null,
    isPrivate: body.isPrivate ?? false,
    isActive: body.isActive ?? true,
    displayOrder: body.displayOrder ?? 0,
  } as Partial<DiningService>) as DiningService;

  const saved = await repo.save(service);
  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/dining-services
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository(DiningService);
  const service = await repo.findOneBy({ id });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const allowed = [
    "name", "type", "dayOfWeek", "startTime", "endTime", "lastSeatingTime",
    "maxCovers", "minPartySize", "maxPartySize", "slotIntervalMin",
    "defaultDurationMin", "requiresPrepayment", "prepaymentAmount",
    "autoConfirm", "diningRoomIds", "isPrivate", "isActive", "displayOrder",
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      (service as any)[key] = fields[key];
    }
  }

  const saved = await repo.save(service);
  return NextResponse.json(saved);
}

// DELETE /api/dining-services?id=X
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository(DiningService);
  const service = await repo.findOneBy({ id });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  await repo.remove(service);
  return NextResponse.json({ ok: true });
}
