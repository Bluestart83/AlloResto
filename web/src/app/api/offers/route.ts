import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Offer } from "@/db/entities/Offer";

// GET /api/offers?restaurantId=X
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const db = await getDb();
  const offers = await db.getRepository(Offer).find({
    where: { restaurantId },
    order: { isActive: "DESC", name: "ASC" },
  });

  return NextResponse.json(offers);
}

// POST /api/offers
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.restaurantId || !body.name) {
    return NextResponse.json({ error: "restaurantId and name required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository(Offer);
  const offer = repo.create({
    restaurantId: body.restaurantId,
    name: body.name,
    description: body.description || null,
    type: body.type || "menu",
    menuItemId: body.menuItemId || null,
    discountPercent: body.discountPercent ?? null,
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    isPermanent: body.isPermanent ?? false,
    minPartySize: body.minPartySize ?? null,
    maxPartySize: body.maxPartySize ?? null,
    minDishes: body.minDishes ?? null,
    maxDishes: body.maxDishes ?? null,
    hasPrepayment: body.hasPrepayment ?? false,
    prepaymentAmount: body.prepaymentAmount ?? null,
    prepaymentType: body.prepaymentType || null,
    isBookable: body.isBookable ?? true,
    isActive: body.isActive ?? true,
  } as Partial<Offer>) as Offer;

  const saved = await repo.save(offer);
  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/offers
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository(Offer);
  const offer = await repo.findOneBy({ id });
  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const allowed = [
    "name", "description", "type", "menuItemId", "discountPercent",
    "startDate", "endDate", "isPermanent", "minPartySize", "maxPartySize",
    "minDishes", "maxDishes", "hasPrepayment", "prepaymentAmount",
    "prepaymentType", "isBookable", "isActive",
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      (offer as any)[key] = fields[key];
    }
  }

  const saved = await repo.save(offer);
  return NextResponse.json(saved);
}

// DELETE /api/offers?id=X
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository(Offer);
  const offer = await repo.findOneBy({ id });
  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  await repo.remove(offer);
  return NextResponse.json({ ok: true });
}
