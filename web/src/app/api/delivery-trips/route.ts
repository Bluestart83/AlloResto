import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { DeliveryTrip } from "@/db/entities/DeliveryTrip";
import type { Order } from "@/db/entities/Order";
import type { Restaurant } from "@/db/entities/Restaurant";
import type { OrderItem } from "@/db/entities/OrderItem";
import { optimizeRoute } from "@/services/route-optimization.service";
import { In } from "typeorm";

// GET /api/delivery-trips?restaurantId=xxx&status=active|completed|all
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const status = req.nextUrl.searchParams.get("status");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const where: any = { restaurantId };
  if (status === "active") {
    where.status = In(["planning", "in_progress"]);
  } else if (status && status !== "all") {
    where.status = status;
  }

  const trips = await ds.getRepository<DeliveryTrip>("delivery_trips").find({
    where,
    order: { createdAt: "DESC" },
    take: 50,
  });

  return NextResponse.json(trips);
}

// POST /api/delivery-trips — créer une tournée optimisée
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();
  const { restaurantId, orderIds } = body;

  if (!restaurantId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { error: "restaurantId and orderIds[] required" },
      { status: 400 },
    );
  }

  // 1. Charger le restaurant (origin)
  const restaurant = await ds.getRepository<Restaurant>("restaurants").findOneBy({ id: restaurantId });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.lat || !restaurant.lng) {
    return NextResponse.json(
      { error: "Restaurant coordinates not set — geocode the restaurant first" },
      { status: 400 },
    );
  }

  // 2. Charger les commandes
  const orders = await ds.getRepository<Order>("orders").find({
    where: { id: In(orderIds) },
    relations: ["items"],
  });

  // Vérifications
  const errors: string[] = [];
  for (const oid of orderIds) {
    const order = orders.find((o) => o.id === oid);
    if (!order) {
      errors.push(`Order ${oid} not found`);
    } else if (order.restaurantId !== restaurantId) {
      errors.push(`Order ${oid} belongs to another restaurant`);
    } else if (order.orderType !== "delivery") {
      errors.push(`Order ${oid} is not a delivery order`);
    } else if (order.status !== "ready") {
      errors.push(`Order ${oid} is not ready (status: ${order.status})`);
    } else if (order.tripId) {
      errors.push(`Order ${oid} is already assigned to a trip`);
    } else if (!order.deliveryLat || !order.deliveryLng) {
      errors.push(`Order ${oid} has no delivery coordinates`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  // 3. Optimiser la route
  const result = await optimizeRoute(
    Number(restaurant.lat),
    Number(restaurant.lng),
    orders,
  );

  // Enrichir les stops avec le nombre d'articles
  for (const stop of result.stops) {
    const order = orders.find((o) => o.id === stop.orderId);
    if (order) {
      stop.itemCount = order.items?.length || 0;
    }
  }

  // 4. Créer le DeliveryTrip
  const trip = ds.getRepository<DeliveryTrip>("delivery_trips").create({
    restaurantId,
    status: "in_progress",
    stops: result.stops,
    totalDistanceKm: result.totalDistanceKm,
    totalDurationMin: result.totalDurationMin,
    orderCount: orders.length,
    googleMapsUrl: result.googleMapsUrl,
    overviewPolyline: result.overviewPolyline,
    startedAt: new Date(),
  } as Partial<DeliveryTrip>) as DeliveryTrip;

  const savedTrip = await ds.getRepository<DeliveryTrip>("delivery_trips").save(trip);

  // 5. Mettre à jour les commandes : tripId + status → delivering
  for (const order of orders) {
    await ds.getRepository<Order>("orders").update(order.id, {
      tripId: savedTrip.id,
      status: "delivering",
    });
  }

  return NextResponse.json(savedTrip, { status: 201 });
}
