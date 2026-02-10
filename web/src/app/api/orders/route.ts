import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";
import { OrderItem } from "@/db/entities/OrderItem";
import { Customer } from "@/db/entities/Customer";
import { Call } from "@/db/entities/Call";
import { scheduleOrder } from "@/services/planning-engine.service";
import { classifyOrderSize } from "@/types/planning";

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

  // 1. Auto-compute order size and scheduling
  const itemCount = items?.length || 1;
  orderData.orderSize = classifyOrderSize(itemCount);

  try {
    const scheduling = await scheduleOrder(
      orderData.restaurantId,
      itemCount,
      orderData.orderType || "pickup",
      orderData.estimatedReadyAt ? new Date(orderData.estimatedReadyAt) : null,
      orderData.deliveryDurationMin || 0,
    );
    if (scheduling) {
      orderData.cookStartAt = scheduling.cookStartAt;
      orderData.handoffAt = scheduling.handoffAt;
      if (!orderData.estimatedReadyAt) {
        orderData.estimatedReadyAt = scheduling.estimatedReadyAt;
      }
    }
  } catch (e) {
    console.warn("[POST /api/orders] scheduling failed, continuing without:", e);
  }

  const order = ds.getRepository(Order).create(orderData as Partial<Order>) as Order;
  const savedOrder = await ds.getRepository(Order).save(order) as Order;

  // 2. Créer les lignes de commande (menuItemId déjà résolu par app.py)
  if (items?.length) {
    for (const item of items) {
      if (item.totalPrice == null) {
        item.totalPrice = (item.unitPrice || 0) * (item.quantity || 1);
      }
      const orderItem = ds.getRepository(OrderItem).create({
        ...item,
        orderId: savedOrder.id,
      } as Partial<OrderItem>) as OrderItem;
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

// PATCH /api/orders — mettre à jour status et/ou estimatedReadyAt
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, status, estimatedReadyAt, cookStartAt, handoffAt } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, any> = {};
  if (status) updates.status = status;
  if (estimatedReadyAt !== undefined) updates.estimatedReadyAt = estimatedReadyAt;
  if (cookStartAt !== undefined) updates.cookStartAt = cookStartAt;
  if (handoffAt !== undefined) updates.handoffAt = handoffAt;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  await ds.getRepository(Order).update(id, updates);
  const updated = await ds.getRepository(Order).findOne({
    where: { id },
    relations: ["items", "customer"],
  });

  return NextResponse.json(updated);
}
