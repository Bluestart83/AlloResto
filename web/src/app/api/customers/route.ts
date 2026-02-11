import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Customer } from "@/db/entities/Customer";

// GET /api/customers?phone=0612345678  or  ?restaurantId=xxx (list)
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const phone = req.nextUrl.searchParams.get("phone");

  if (phone) {
    // Lookup par tel (cross-restaurant — le client est reconnu partout)
    const customer = await ds.getRepository(Customer).findOneBy({ phone });
    return NextResponse.json(customer || null);
  }

  // Liste des clients (optionnellement filtrée par resto)
  if (restaurantId) {
    const customers = await ds.getRepository(Customer).find({
      where: { restaurantId },
      order: { totalOrders: "DESC" },
    });
    return NextResponse.json(customers);
  }

  return NextResponse.json({ error: "phone or restaurantId required" }, { status: 400 });
}

// POST /api/customers — créer ou mettre à jour un client
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const { restaurantId, phone, ...data } = body;

  if (!phone) {
    return NextResponse.json(
      { error: "phone required" },
      { status: 400 }
    );
  }

  // Upsert : chercher par tel uniquement (cross-restaurant)
  let customer = await ds.getRepository(Customer).findOneBy({ phone });

  if (customer) {
    // Mettre à jour les champs fournis
    Object.assign(customer, data);
    // Mettre à jour restaurantId si fourni (dernière interaction)
    if (restaurantId) customer.restaurantId = restaurantId;
    customer = await ds.getRepository(Customer).save(customer);
  } else {
    customer = ds.getRepository(Customer).create({
      restaurantId: restaurantId || null,
      phone,
      ...data,
    } as Partial<Customer>) as Customer;
    customer = await ds.getRepository(Customer).save(customer);
  }

  return NextResponse.json(customer);
}
