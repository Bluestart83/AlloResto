import { NextRequest, NextResponse } from "next/server";
import { AppDataSource } from "@/db/data-source";
import type { DiningRoom } from "@/db/entities/DiningRoom";

async function getDs() {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

// GET /api/rooms?restaurantId=X
export async function GET(req: NextRequest) {
  try {
    const ds = await getDs();
    const restaurantId = new URL(req.url).searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const rooms = await ds.getRepository<DiningRoom>("dining_rooms").find({
      where: { restaurantId },
      order: { displayOrder: "ASC", name: "ASC" },
      relations: ["tables"],
    });
    return NextResponse.json(rooms);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/rooms
export async function POST(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.restaurantId || !body.name) {
      return NextResponse.json({ error: "restaurantId and name required" }, { status: 400 });
    }

    const repo = ds.getRepository<DiningRoom>("dining_rooms");
    const room = repo.create({
      restaurantId: body.restaurantId,
      name: body.name,
      description: body.description || null,
      displayOrder: body.displayOrder || 0,
    } as Partial<DiningRoom>) as DiningRoom;

    const saved = await repo.save(room);
    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/rooms
export async function PATCH(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;

    await ds.getRepository<DiningRoom>("dining_rooms").update(body.id, updates);
    const updated = await ds.getRepository<DiningRoom>("dining_rooms").findOne({
      where: { id: body.id },
      relations: ["tables"],
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/rooms?id=X
export async function DELETE(req: NextRequest) {
  try {
    const ds = await getDs();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await ds.getRepository<DiningRoom>("dining_rooms").delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
