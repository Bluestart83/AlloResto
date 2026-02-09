import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";

// GET /api/restaurants — liste des restaurants
export async function GET() {
  const ds = await getDb();
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
