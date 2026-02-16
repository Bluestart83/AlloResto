/**
 * POST /api/ai/tools/confirm-order
 *
 * Thin wrapper for sip-agent-server ToolExecutor.
 * Receives raw AI arguments (with #N item IDs) + context variables,
 * resolves #N → UUID via itemMap, then creates the order via the
 * existing Order service.
 *
 * Body:
 * - restaurantId, order_type, items, total, subtotal, delivery_fee,
 *   payment_method, notes (from AI args)
 * - itemMap, callId, customerId, customerName, callerPhone,
 *   estimatedTimeISO, estimatedTime, customerAddressFormatted,
 *   deliveryDistanceKm, deliveryLat, deliveryLng (from ContextStore)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Order } from "@/db/entities/Order";
import { OrderItem } from "@/db/entities/OrderItem";
import { Customer } from "@/db/entities/Customer";
import { Call } from "@/db/entities/Call";
import { scheduleOrder } from "@/services/planning-engine.service";
import { classifyOrderSize } from "@/types/planning";

interface ItemArg {
  id: number;
  quantity: number;
  unit_price: number;
  selected_options?: {
    name?: string;
    choice_id?: number;
    choice?: string;
    extra_price?: number;
  }[];
  notes?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantId,
    order_type = "pickup",
    items = [],
    total = 0,
    delivery_fee = 0,
    payment_method = "cash",
    notes = "",
    // Context variables (from sip-agent-server ContextStore)
    item_map: itemMap = {},
    call_id: callId,
    customer_id: customerId,
    customer_name: customerName,
    caller_phone: callerPhone = "",
    // From last check_availability
    last_availability_check: availability = {},
  } = body;

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Resolve estimatedReadyAt from context
  let estimatedReadyAt = availability?.estimatedTimeISO;
  let heureStr = availability?.estimatedTime || "";

  if (!estimatedReadyAt) {
    const readyDate = new Date(Date.now() + 30 * 60_000);
    estimatedReadyAt = readyDate.toISOString();
    heureStr = readyDate.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Resolve #N → UUID via itemMap
  const resolvedItems: Record<string, any>[] = [];
  for (const item of items as ItemArg[]) {
    const itemIdx = String(item.id ?? "");
    const entry = itemMap[itemIdx];
    const menuItemId = entry?.id ?? null;
    const itemName = entry?.name ?? `Item #${itemIdx}`;

    const resolvedOptions: Record<string, any>[] = [];
    for (const opt of item.selected_options || []) {
      if (opt.choice_id != null) {
        const choiceEntry = itemMap[String(opt.choice_id)];
        resolvedOptions.push({
          name: opt.name || "",
          choice: choiceEntry?.name ?? `#${opt.choice_id}`,
          extra_price: opt.extra_price || 0,
        });
      } else {
        resolvedOptions.push({
          name: opt.name || "",
          choice: opt.choice || "",
          extra_price: opt.extra_price || 0,
        });
      }
    }

    resolvedItems.push({
      menuItemId,
      name: itemName,
      quantity: item.quantity || 1,
      unitPrice: item.unit_price || 0,
      totalPrice: (item.unit_price || 0) * (item.quantity || 1),
      selectedOptions: resolvedOptions,
      notes: item.notes,
    });
  }

  // Build order data
  const orderType = order_type;
  const orderData: Record<string, any> = {
    restaurantId,
    callId: callId || null,  // sip-agent-server CallRecord UUID (no local FK)
    customerId: customerId || null,
    customerName: customerName || null,
    customerPhone: callerPhone,
    total,
    orderType,
    deliveryAddress:
      orderType === "delivery" ? availability.customerAddressFormatted : null,
    deliveryDistanceKm:
      orderType === "delivery" ? availability.deliveryDistanceKm : null,
    deliveryLat:
      orderType === "delivery" ? availability.customerLat : null,
    deliveryLng:
      orderType === "delivery" ? availability.customerLng : null,
    deliveryFee: delivery_fee || 0,
    estimatedReadyAt,
    notes: notes || "",
    paymentMethod: payment_method || "cash",
    source: "phone_ai",
  };

  try {
    // Auto-compute order size and scheduling
    const itemCount = resolvedItems.length || 1;
    orderData.orderSize = classifyOrderSize(itemCount);

    try {
      const scheduling = await scheduleOrder(
        restaurantId,
        itemCount,
        orderType,
        estimatedReadyAt ? new Date(estimatedReadyAt) : null,
        0,
      );
      if (scheduling) {
        orderData.cookStartAt = scheduling.cookStartAt;
        orderData.handoffAt = scheduling.handoffAt;
        if (!orderData.estimatedReadyAt) {
          orderData.estimatedReadyAt = scheduling.estimatedReadyAt;
        }
      }
    } catch (e) {
      console.warn("[confirm-order] scheduling failed:", e);
    }

    const ds = await getDb();

    const order = ds.getRepository(Order).create(orderData as Partial<Order>) as Order;
    const savedOrder = await ds.getRepository(Order).save(order) as Order;

    // Create order items
    for (const item of resolvedItems) {
      const orderItem = ds.getRepository(OrderItem).create({
        ...item,
        orderId: savedOrder.id,
      } as Partial<OrderItem>) as OrderItem;
      await ds.getRepository(OrderItem).save(orderItem);
    }

    // NOTE: Call outcome is updated by the webhook at end of call, not here.
    // The sip-agent-server call_id doesn't exist in AlloResto's calls table.

    // Update customer stats
    if (customerId) {
      const customer = await ds.getRepository(Customer).findOneBy({ id: customerId });
      if (customer) {
        customer.totalOrders += 1;
        customer.totalSpent = Number(customer.totalSpent) + Number(total || 0);
        customer.lastOrderAt = new Date();
        await ds.getRepository(Customer).save(customer);
      }
    }

    const mode = orderType === "delivery" ? "livree" : "prete";
    return NextResponse.json({
      success: true,
      order_id: savedOrder.id,
      order_number: savedOrder.orderNumber,
      message: `Commande de ${total}EUR enregistree`,
      heure_estimee: heureStr,
      mode,
    });
  } catch (e: any) {
    console.error("[confirm-order] error:", e);
    return NextResponse.json(
      { success: false, error: e.message || "Erreur creation commande" },
      { status: 500 },
    );
  }
}
