import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Customer } from "@/db/entities/Customer";

// GET /api/customers?restaurantId=xxx&phone=0612345678
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const phone = req.nextUrl.searchParams.get("phone");

  if (restaurantId && phone) {
    // Lookup par tel + resto (appelé par le SIP service à chaque appel)
    const customer = await ds.getRepository(Customer).findOneBy({
      restaurantId,
      phone,
    });
    return NextResponse.json(customer || null);
  }

  // Liste des clients d'un resto
  if (restaurantId) {
    const customers = await ds.getRepository(Customer).find({
      where: { restaurantId },
      order: { totalOrders: "DESC" },
    });
    return NextResponse.json(customers);
  }

  return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
}

// POST /api/customers — créer ou mettre à jour un client
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const { restaurantId, phone, ...data } = body;

  if (!restaurantId || !phone) {
    return NextResponse.json(
      { error: "restaurantId and phone required" },
      { status: 400 }
    );
  }

  // Upsert : chercher existant ou créer
  let customer = await ds.getRepository(Customer).findOneBy({
    restaurantId,
    phone,
  });

  if (customer) {
    // Mettre à jour les champs fournis
    Object.assign(customer, data);
    customer = await ds.getRepository(Customer).save(customer);
  } else {
    customer = ds.getRepository(Customer).create({
      restaurantId,
      phone,
      ...data,
    });
    customer = await ds.getRepository(Customer).save(customer);
  }

  return NextResponse.json(customer);
}
