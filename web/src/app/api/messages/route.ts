import { NextRequest, NextResponse } from "next/server";
import { AppDataSource } from "@/db/data-source";
import { Message } from "@/db/entities/Message";

async function getDs() {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

// GET /api/messages?restaurantId=X&unreadOnly=true
export async function GET(req: NextRequest) {
  try {
    const ds = await getDs();
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const qb = ds
      .getRepository(Message)
      .createQueryBuilder("m")
      .where("m.restaurant_id = :rid", { rid: restaurantId })
      .orderBy("m.created_at", "DESC");

    if (searchParams.get("unreadOnly") === "true") {
      qb.andWhere("m.is_read = :isRead", { isRead: false });
    }

    const messages = await qb.getMany();
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/messages — créer un message (depuis l'IA via main.py)
export async function POST(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.restaurantId || !body.content) {
      return NextResponse.json(
        { error: "restaurantId and content required" },
        { status: 400 }
      );
    }

    const repo = ds.getRepository(Message);
    const message = repo.create({
      restaurantId: body.restaurantId,
      callId: body.callId || null,
      callerPhone: body.callerPhone || "",
      callerName: body.callerName || null,
      content: body.content,
      category: body.category || "other",
      isUrgent: body.isUrgent || false,
    } as Partial<Message>) as Message;

    const saved = await repo.save(message);
    return NextResponse.json(saved, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/messages — marquer lu / modifier
export async function PATCH(req: NextRequest) {
  try {
    const ds = await getDs();
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (body.isRead !== undefined) updates.isRead = body.isRead;
    if (body.isUrgent !== undefined) updates.isUrgent = body.isUrgent;

    await ds.getRepository(Message).update(body.id, updates);
    const updated = await ds.getRepository(Message).findOneBy({ id: body.id });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/messages?id=X
export async function DELETE(req: NextRequest) {
  try {
    const ds = await getDs();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await ds.getRepository(Message).delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
