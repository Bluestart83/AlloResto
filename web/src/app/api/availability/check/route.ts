import { NextRequest, NextResponse } from "next/server";
import { checkAvailability } from "@/services/availability.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.restaurantId) {
      return NextResponse.json(
        { error: "restaurantId required" },
        { status: 400 }
      );
    }

    if (!body.mode || !["pickup", "delivery", "reservation"].includes(body.mode)) {
      return NextResponse.json(
        { error: "mode must be pickup, delivery, or reservation" },
        { status: 400 }
      );
    }

    const result = await checkAvailability({
      restaurantId: body.restaurantId,
      mode: body.mode,
      requestedTime: body.requestedTime,
      customerAddress: body.customerAddress,
      customerCity: body.customerCity,
      customerPostalCode: body.customerPostalCode,
      partySize: body.partySize,
      seatingPreference: body.seatingPreference,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Availability check error:", error);
    return NextResponse.json(
      { error: error.message || "Availability check failed" },
      { status: 500 }
    );
  }
}
