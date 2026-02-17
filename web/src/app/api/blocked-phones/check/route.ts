import { NextRequest, NextResponse } from "next/server";
import { AppDataSource } from "@/db/data-source";
import type { BlockedPhone } from "@/db/entities/BlockedPhone";

async function getDs() {
  const ds = AppDataSource;
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

// GET /api/blocked-phones/check?restaurantId=X&phone=Y
export async function GET(req: NextRequest) {
  try {
    const ds = await getDs();
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    const phone = searchParams.get("phone");

    if (!restaurantId || !phone) {
      return NextResponse.json(
        { error: "restaurantId and phone required" },
        { status: 400 }
      );
    }

    const entry = await ds.getRepository<BlockedPhone>("blocked_phones").findOneBy({
      restaurantId,
      phone,
    });

    return NextResponse.json({
      blocked: !!entry,
      reason: entry?.reason || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
