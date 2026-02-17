import { NextRequest, NextResponse } from "next/server";
import { AppDataSource } from "@/db/data-source";
import type { DiningTable } from "@/db/entities/DiningTable";

async function getDs() {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

// GET /api/tables?restaurantId=X or ?roomId=X
export async function GET(req: NextRequest) {
  try {
    const ds = await getDs();
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    const roomId = searchParams.get("roomId");

    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    if (roomId) where.diningRoomId = roomId;

    if (!restaurantId && !roomId) {
      return NextResponse.json({ error: "restaurantId or roomId required" }, { status: 400 });
    }

    const tables = await ds.getRepository<DiningTable>("dining_tables").find({
      where,
      order: { displayOrder: "ASC", tableNumber: "ASC" },
    });
    return NextResponse.json(tables);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/tables
export async function POST(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.restaurantId || !body.diningRoomId || !body.tableNumber || !body.seats) {
      return NextResponse.json(
        { error: "restaurantId, diningRoomId, tableNumber, seats required" },
        { status: 400 }
      );
    }

    const repo = ds.getRepository<DiningTable>("dining_tables");
    const table = repo.create({
      restaurantId: body.restaurantId,
      diningRoomId: body.diningRoomId,
      tableNumber: body.tableNumber,
      seats: body.seats,
      isActive: body.isActive ?? true,
      displayOrder: body.displayOrder || 0,
    } as Partial<DiningTable>) as DiningTable;

    const saved = await repo.save(table);
    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/tables
export async function PATCH(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (body.tableNumber !== undefined) updates.tableNumber = body.tableNumber;
    if (body.seats !== undefined) updates.seats = body.seats;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;
    if (body.diningRoomId !== undefined) updates.diningRoomId = body.diningRoomId;

    await ds.getRepository<DiningTable>("dining_tables").update(body.id, updates);
    const updated = await ds.getRepository<DiningTable>("dining_tables").findOneBy({ id: body.id });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/tables?id=X
export async function DELETE(req: NextRequest) {
  try {
    const ds = await getDs();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await ds.getRepository<DiningTable>("dining_tables").delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
