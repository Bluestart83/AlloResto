import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";

// GET /api/restaurants — liste (ou un seul si ?id=xxx)
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const restaurant = await ds.getRepository(Restaurant).findOneBy({ id });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    return NextResponse.json(restaurant);
  }

  const restaurants = await ds.getRepository(Restaurant).find({
    where: { isActive: true },
    order: { createdAt: "DESC" },
  });
  return NextResponse.json(restaurants);
}

// POST /api/restaurants — créer un restaurant
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const restaurant = ds.getRepository(Restaurant).create(body);
  const saved = await ds.getRepository(Restaurant).save(restaurant);

  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/restaurants — mettre à jour un restaurant
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, ...updates } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const restaurant = await ds.getRepository(Restaurant).findOneBy({ id });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  Object.assign(restaurant, updates);
  const saved = await ds.getRepository(Restaurant).save(restaurant);
  return NextResponse.json(saved);
}
