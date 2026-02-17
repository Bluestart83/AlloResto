import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { MenuCategory } from "@/db/entities/MenuCategory";
import type { MenuItem } from "@/db/entities/MenuItem";

// GET /api/menu?restaurantId=xxx — menu complet (catégories + items)
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const categories = await ds.getRepository<MenuCategory>("menu_categories").find({
    where: { restaurantId },
    order: { displayOrder: "ASC" },
  });

  const items = await ds.getRepository<MenuItem>("menu_items").find({
    where: { restaurantId },
    order: { displayOrder: "ASC" },
  });

  return NextResponse.json({ categories, items });
}

// POST /api/menu — ajouter un item
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  if (body.type === "category") {
    const cat = ds.getRepository<MenuCategory>("menu_categories").create(body.data as Partial<MenuCategory>) as MenuCategory;
    const saved = await ds.getRepository<MenuCategory>("menu_categories").save(cat);
    return NextResponse.json(saved, { status: 201 });
  }

  const item = ds.getRepository<MenuItem>("menu_items").create((body.data || body) as Partial<MenuItem>) as MenuItem;
  const saved = await ds.getRepository<MenuItem>("menu_items").save(item);
  return NextResponse.json(saved, { status: 201 });
}

// PATCH /api/menu — modifier un item
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, type, ...updates } = await req.json();

  if (type === "category") {
    await ds.getRepository<MenuCategory>("menu_categories").update(id, updates);
    return NextResponse.json({ success: true });
  }

  await ds.getRepository<MenuItem>("menu_items").update(id, updates);
  return NextResponse.json({ success: true });
}

// DELETE /api/menu?id=xxx&type=item|category
export async function DELETE(req: NextRequest) {
  const ds = await getDb();
  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") || "item";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (type === "category") {
    await ds.getRepository<MenuCategory>("menu_categories").delete(id);
  } else {
    await ds.getRepository<MenuItem>("menu_items").delete(id);
  }

  return NextResponse.json({ success: true });
}
