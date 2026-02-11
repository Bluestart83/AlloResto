import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";
import { OrderItem } from "@/db/entities/OrderItem";
import { Customer } from "@/db/entities/Customer";
import { Call } from "@/db/entities/Call";
import { Restaurant } from "@/db/entities/Restaurant";
import { scheduleOrder } from "@/services/planning-engine.service";
import { classifyOrderSize } from "@/types/planning";
import { syncOrderOutbound } from "@/services/sync/workers/outbound-sync.worker";

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
    relations: ["items", "customer", "call"],
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

// Champs éditables de la commande
const EDITABLE_ORDER_FIELDS = [
  "status", "estimatedReadyAt", "cookStartAt", "handoffAt",
  "customerName", "customerPhone", "orderType",
  "deliveryAddress", "notes", "total",
] as const;

// PATCH /api/orders — mettre à jour la commande (status, infos, articles)
export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();
  const { id, items: itemUpdates, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // 1. Mise à jour des champs de la commande
  const updates: Record<string, any> = {};
  for (const key of EDITABLE_ORDER_FIELDS) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }

  if (Object.keys(updates).length > 0) {
    await ds.getRepository(Order).update(id, updates);
  }

  // 2. Mise à jour des articles (si fournis)
  if (Array.isArray(itemUpdates)) {
    const itemRepo = ds.getRepository(OrderItem);

    for (const item of itemUpdates) {
      if (item._delete && item.id) {
        // Supprimer l'article
        await itemRepo.delete(item.id);
      } else if (item.id) {
        // Modifier quantité / notes
        const itemUp: Record<string, any> = {};
        if (item.quantity !== undefined) {
          itemUp.quantity = item.quantity;
          itemUp.totalPrice = item.quantity * (item.unitPrice ?? 0);
        }
        if (item.notes !== undefined) itemUp.notes = item.notes;
        if (Object.keys(itemUp).length > 0) {
          await itemRepo.update(item.id, itemUp);
        }
      } else if (!item.id && item.menuItemId) {
        // Nouvel article ajouté depuis le menu
        const qty = item.quantity || 1;
        const newItem = itemRepo.create({
          orderId: id,
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: qty,
          unitPrice: item.unitPrice || 0,
          totalPrice: (item.unitPrice || 0) * qty,
          selectedOptions: item.selectedOptions || [],
          notes: item.notes || null,
        } as Partial<OrderItem>) as OrderItem;
        await itemRepo.save(newItem);
      }
    }

    // Recalculer le total automatiquement si pas fourni manuellement
    if (updates.total === undefined) {
      const freshItems = await itemRepo.find({ where: { orderId: id } });
      const newTotal = freshItems.reduce((sum, it) => sum + Number(it.totalPrice), 0);
      const order = await ds.getRepository(Order).findOneBy({ id });
      const deliveryFee = order ? Number(order.deliveryFee) : 0;
      await ds.getRepository(Order).update(id, { total: newTotal + deliveryFee });
    }
  }

  if (Object.keys(updates).length === 0 && !Array.isArray(itemUpdates)) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await ds.getRepository(Order).findOne({
    where: { id },
    relations: ["items", "customer", "call"],
  });

  // Sync outbound: propager les modifications vers le service externe
  if (updated && updated.source !== "phone_ai" && updated.source !== "manual") {
    syncOrderOutbound(updated).catch((err) =>
      console.error("[PATCH /api/orders] outbound sync error:", err)
    );
  }

  return NextResponse.json(updated);
}
