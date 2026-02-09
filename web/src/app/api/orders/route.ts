import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";
import { OrderItem } from "@/db/entities/OrderItem";
import { Customer } from "@/db/entities/Customer";
import { Call } from "@/db/entities/Call";

// GET /api/orders?restaurantId=xxx&status=pending
export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const status = req.nextUrl.searchParams.get("status");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const where: any = { restaurantId };
  if (status) where.status = status;

  const orders = await ds.getRepository(Order).find({
    where,
    relations: ["items", "customer"],
    order: { createdAt: "DESC" },
    take: 50,
  });

  return NextResponse.json(orders);
}

// POST /api/orders — créer une commande (appelé par SIP service via function call)
export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();
  const { items, ...orderData } = body;

  // 1. Créer la commande
  const order = ds.getRepository(Order).create(orderData);
  const savedOrder = await ds.getRepository(Order).save(order);

  // 2. Créer les lignes
  if (items?.length) {
    for (const item of items) {
      const orderItem = ds.getRepository(OrderItem).create({
        ...item,
        orderId: savedOrder.id,
      });
      await ds.getRepository(OrderItem).save(orderItem);
    }
  }

  // 3. Mettre à jour l'appel
  if (orderData.callId) {
    await ds.getRepository(Call).update(orderData.callId, {
      outcome: "order_placed",
    });
  }

  // 4. Mettre à jour les stats du client
  if (orderData.customerId) {
    const customer = await ds.getRepository(Customer).findOneBy({
      id: orderData.customerId,
    });
    if (customer) {
      customer.totalOrders += 1;
      customer.totalSpent = Number(customer.totalSpent) + Number(orderData.total || 0);
      customer.lastOrderAt = new Date();
      await ds.getRepository(Customer).save(customer);
    }
  }

  // 5. Recharger avec relations
  const full = await ds.getRepository(Order).findOne({
    where: { id: savedOrder.id },
    relations: ["items"],
  });

  return NextResponse.json(full, { status: 201 });
}

// PATCH /api/orders — changer le status
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, status } = await req.json();

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  await ds.getRepository(Order).update(id, { status });
  const updated = await ds.getRepository(Order).findOne({
    where: { id },
    relations: ["items", "customer"],
  });

  return NextResponse.json(updated);
}
