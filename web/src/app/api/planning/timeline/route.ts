import { NextRequest, NextResponse } from "next/server";
import { getTimelineSnapshot } from "@/services/planning-engine.service";

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const snapshot = await getTimelineSnapshot(restaurantId);
    return NextResponse.json(snapshot);
  } catch (err: any) {
    console.error("[GET /api/planning/timeline]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
