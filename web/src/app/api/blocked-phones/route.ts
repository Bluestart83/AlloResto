import { NextRequest, NextResponse } from "next/server";
import { AppDataSource } from "@/db/data-source";
import type { BlockedPhone } from "@/db/entities/BlockedPhone";

async function getDs() {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

// GET /api/blocked-phones?restaurantId=X
export async function GET(req: NextRequest) {
  try {
    const ds = await getDs();
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const blocked = await ds.getRepository<BlockedPhone>("blocked_phones").find({
      where: { restaurantId },
      order: { createdAt: "DESC" },
    });
    return NextResponse.json(blocked);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/blocked-phones — bloquer un numéro
export async function POST(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();

    if (!body.restaurantId || !body.phone) {
      return NextResponse.json(
        { error: "restaurantId and phone required" },
        { status: 400 }
      );
    }

    // Vérifier si déjà bloqué
    const existing = await ds.getRepository<BlockedPhone>("blocked_phones").findOneBy({
      restaurantId: body.restaurantId,
      phone: body.phone,
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    const repo = ds.getRepository<BlockedPhone>("blocked_phones");
    const entry = repo.create({
      restaurantId: body.restaurantId,
      phone: body.phone,
      reason: body.reason || null,
    } as Partial<BlockedPhone>) as BlockedPhone;

    const saved = await repo.save(entry);
    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/blocked-phones?restaurantId=X&phone=Y  or  ?id=Z
export async function DELETE(req: NextRequest) {
  try {
    const ds = await getDs();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const restaurantId = searchParams.get("restaurantId");
    const phone = searchParams.get("phone");

    if (id) {
      await ds.getRepository<BlockedPhone>("blocked_phones").delete(id);
    } else if (restaurantId && phone) {
      await ds.getRepository<BlockedPhone>("blocked_phones").delete({ restaurantId, phone });
    } else {
      return NextResponse.json(
        { error: "id or (restaurantId + phone) required" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
