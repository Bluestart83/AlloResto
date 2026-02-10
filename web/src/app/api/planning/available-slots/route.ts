import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/services/planning-engine.service";

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    const orderType = req.nextUrl.searchParams.get("orderType") || "pickup";
    const itemCount = parseInt(req.nextUrl.searchParams.get("itemCount") || "1", 10);
    const transitMin = parseInt(req.nextUrl.searchParams.get("transitMin") || "0", 10);

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const slots = await getAvailableSlots(restaurantId, orderType, itemCount, transitMin);
    return NextResponse.json(slots);
  } catch (err: any) {
    console.error("[GET /api/planning/available-slots]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
