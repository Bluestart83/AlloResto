/**
 * /api/delivery/check/route.ts
 *
 * POST /api/delivery/check
 * 
 * Appelé par :
 *   - Le service Python PJSIP pendant un appel (via HTTP)
 *   - Le dashboard pour simuler une vérification
 *
 * Body :
 *   {
 *     "restaurantId": "uuid",            // OU fournir lat/lng directement
 *     "restaurantLat": 43.2965,
 *     "restaurantLng": 5.3698,
 *     "deliveryRadiusKm": 5.0,
 *     "avgPrepTimeMin": 30,
 *     "customerAddress": "45 boulevard Longchamp",
 *     "customerCity": "Marseille",
 *     "customerPostalCode": "13001"
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkDelivery } from "@/services/delivery.service";
import { AppDataSource } from "@/db/data-source";
import { Restaurant } from "@/db/entities/Restaurant";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let restaurantLat = body.restaurantLat;
    let restaurantLng = body.restaurantLng;
    let deliveryRadiusKm = body.deliveryRadiusKm ?? 5.0;
    let avgPrepTimeMin = body.avgPrepTimeMin ?? 30;

    // Si restaurantId fourni, charger depuis la BDD
    if (body.restaurantId && (!restaurantLat || !restaurantLng)) {
      const ds = AppDataSource;
      if (!ds.isInitialized) await ds.initialize();

      const restaurant = await ds
        .getRepository(Restaurant)
        .findOneBy({ id: body.restaurantId });

      if (!restaurant) {
        return NextResponse.json(
          { error: "Restaurant not found" },
          { status: 404 }
        );
      }

      restaurantLat = restaurant.lat;
      restaurantLng = restaurant.lng;
      deliveryRadiusKm = restaurant.deliveryRadiusKm;
      avgPrepTimeMin = restaurant.avgPrepTimeMin;
    }

    if (!restaurantLat || !restaurantLng) {
      return NextResponse.json(
        { error: "Restaurant coordinates required" },
        { status: 400 }
      );
    }

    if (!body.customerAddress) {
      return NextResponse.json(
        { error: "customerAddress required" },
        { status: 400 }
      );
    }

    const result = await checkDelivery({
      restaurantLat,
      restaurantLng,
      deliveryRadiusKm,
      avgPrepTimeMin,
      customerAddress: body.customerAddress,
      customerCity: body.customerCity,
      customerPostalCode: body.customerPostalCode,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Delivery check error:", error);
    return NextResponse.json(
      { error: error.message || "Delivery check failed" },
      { status: 500 }
    );
  }
}
