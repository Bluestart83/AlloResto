/**
 * /api/stats — Dashboard stats (real data)
 *
 * GET /api/stats?restaurantId=xxx
 *   → today's KPIs, hourly breakdown, weekly stats, outcomes, recent calls, top customers
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Call } from "@/db/entities/Call";
import { Order } from "@/db/entities/Order";
import { Customer } from "@/db/entities/Customer";
import { Between, MoreThanOrEqual } from "typeorm";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);

  // ---- Calls today ----
  const callsToday = await ds.getRepository(Call).find({
    where: { restaurantId, startedAt: MoreThanOrEqual(todayStart) },
    order: { startedAt: "DESC" },
  });

  const totalCalls = callsToday.length;
  const outcomes: Record<string, number> = {};
  let totalDurationSec = 0;
  let durationCount = 0;
  let totalCostTelecom = 0;
  let totalCostAi = 0;
  const hourlyMap: Record<number, { calls: number; concurrent: number }> = {};

  for (const c of callsToday) {
    outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
    if (c.durationSec) {
      totalDurationSec += c.durationSec;
      durationCount++;
    }
    totalCostTelecom += Number(c.costTelecom) || 0;
    totalCostAi += Number(c.costAi) || 0;
    const h = new Date(c.startedAt).getHours();
    if (!hourlyMap[h]) hourlyMap[h] = { calls: 0, concurrent: 0 };
    hourlyMap[h].calls++;
  }

  // Max concurrent per hour (simple: count overlapping calls)
  for (let h = 0; h < 24; h++) {
    if (!hourlyMap[h]) hourlyMap[h] = { calls: 0, concurrent: 0 };
    const hourCalls = callsToday.filter((c) => new Date(c.startedAt).getHours() === h);
    let maxConc = 0;
    for (const c of hourCalls) {
      const start = new Date(c.startedAt).getTime();
      const end = c.endedAt ? new Date(c.endedAt).getTime() : start + (c.durationSec || 0) * 1000;
      const conc = hourCalls.filter((other) => {
        const oStart = new Date(other.startedAt).getTime();
        const oEnd = other.endedAt ? new Date(other.endedAt).getTime() : oStart + (other.durationSec || 0) * 1000;
        return oStart < end && oEnd > start;
      }).length;
      maxConc = Math.max(maxConc, conc);
    }
    hourlyMap[h].concurrent = maxConc;
  }

  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    calls: hourlyMap[h]?.calls || 0,
    concurrent: hourlyMap[h]?.concurrent || 0,
  }));

  // ---- Orders today ----
  const ordersToday = await ds.getRepository(Order).find({
    where: { restaurantId, createdAt: MoreThanOrEqual(todayStart) },
  });

  const totalOrders = ordersToday.length;
  let totalRevenue = 0;
  let totalDeliveries = 0;
  let totalDistanceKm = 0;
  let distanceCount = 0;
  const distanceBuckets: Record<string, number> = {
    "0-1 km": 0, "1-2 km": 0, "2-3 km": 0, "3-4 km": 0, "4-5 km": 0, "5+ km": 0,
  };

  for (const o of ordersToday) {
    totalRevenue += Number(o.total) || 0;
    if (o.orderType === "delivery") {
      totalDeliveries++;
      if (o.deliveryDistanceKm != null) {
        const km = Number(o.deliveryDistanceKm);
        totalDistanceKm += km;
        distanceCount++;
        if (km <= 1) distanceBuckets["0-1 km"]++;
        else if (km <= 2) distanceBuckets["1-2 km"]++;
        else if (km <= 3) distanceBuckets["2-3 km"]++;
        else if (km <= 4) distanceBuckets["3-4 km"]++;
        else if (km <= 5) distanceBuckets["4-5 km"]++;
        else distanceBuckets["5+ km"]++;
      }
    }
  }

  const distanceData = Object.entries(distanceBuckets).map(([range, count]) => ({
    range,
    count,
    pct: totalDeliveries > 0 ? Math.round((count / totalDeliveries) * 100) : 0,
  }));

  // ---- Weekly stats ----
  const callsWeek = await ds.getRepository(Call).find({
    where: { restaurantId, startedAt: MoreThanOrEqual(weekStart) },
  });
  const ordersWeek = await ds.getRepository(Order).find({
    where: { restaurantId, createdAt: MoreThanOrEqual(weekStart) },
  });

  const weeklyMap: Record<string, { calls: number; orders: number; revenue: number; cost: number }> = {};
  for (const name of DAY_NAMES) weeklyMap[name] = { calls: 0, orders: 0, revenue: 0, cost: 0 };

  for (const c of callsWeek) {
    const dayName = DAY_NAMES[new Date(c.startedAt).getDay()];
    weeklyMap[dayName].calls++;
    weeklyMap[dayName].cost += (Number(c.costTelecom) || 0) + (Number(c.costAi) || 0);
  }
  for (const o of ordersWeek) {
    const dayName = DAY_NAMES[new Date(o.createdAt).getDay()];
    weeklyMap[dayName].orders++;
    weeklyMap[dayName].revenue += Number(o.total) || 0;
  }

  // Order: Lun, Mar, Mer, Jeu, Ven, Sam, Dim
  const weeklyData = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => ({
    day,
    calls: weeklyMap[day].calls,
    orders: weeklyMap[day].orders,
    revenue: Math.round(weeklyMap[day].revenue * 100) / 100,
    cost: Math.round(weeklyMap[day].cost * 100) / 100,
  }));

  // ---- Outcome chart ----
  const outcomeData = [
    { name: "Commande", value: outcomes["order_placed"] || 0, color: "#10b981" },
    { name: "Info seul.", value: outcomes["info_only"] || 0, color: "#6366f1" },
    { name: "Abandonné", value: outcomes["abandoned"] || 0, color: "#f59e0b" },
    { name: "Erreur", value: outcomes["error"] || 0, color: "#ef4444" },
  ];

  // ---- Recent calls (last 10) ----
  const recentCalls = callsToday.slice(0, 10).map((c) => ({
    id: c.id,
    callerNumber: c.callerNumber,
    customerName: null as string | null,
    duration: c.durationSec || 0,
    outcome: c.outcome,
    total: 0,
    orderType: null as string | null,
    distance: null as number | null,
    time: new Date(c.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  }));

  // Enrich with order data
  for (const rc of recentCalls) {
    const order = ordersToday.find((o) => o.callId === rc.id);
    if (order) {
      rc.total = Number(order.total) || 0;
      rc.orderType = order.orderType;
      rc.distance = order.deliveryDistanceKm != null ? Number(order.deliveryDistanceKm) : null;
      rc.customerName = order.customerName;
    }
  }

  // ---- Top customers ----
  const topCustomers = await ds.getRepository(Customer).find({
    where: { restaurantId },
    order: { totalOrders: "DESC" },
    take: 5,
  });

  const topCustomersData = topCustomers.map((c) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone;
    const phone = c.phone.length > 6 ? c.phone.slice(0, -4) + " **" : c.phone;
    let lastOrder = "—";
    if (c.lastOrderAt) {
      const diff = Math.floor((now.getTime() - new Date(c.lastOrderAt).getTime()) / 86400000);
      if (diff === 0) lastOrder = "Aujourd'hui";
      else if (diff === 1) lastOrder = "Hier";
      else lastOrder = `Il y a ${diff}j`;
    }
    return {
      name,
      phone,
      orders: c.totalOrders,
      spent: Number(c.totalSpent) || 0,
      lastOrder,
    };
  });

  // ---- Computed KPIs ----
  const conversionRate = totalCalls > 0 ? Math.round(((outcomes["order_placed"] || 0) / totalCalls) * 1000) / 10 : 0;
  const avgCallDuration = durationCount > 0 ? Math.round(totalDurationSec / durationCount) : 0;
  const avgDistance = distanceCount > 0 ? Math.round((totalDistanceKm / distanceCount) * 10) / 10 : 0;
  const maxConcurrent = Math.max(...hourlyData.map((h) => h.concurrent), 0);
  const totalMinutes = Math.round(totalDurationSec / 60);
  const costToday = Math.round((totalCostTelecom + totalCostAi) * 100) / 100;

  // Unique callers today
  const uniqueCallers = new Set(callsToday.map((c) => c.callerNumber)).size;

  // Total customers for this restaurant
  const totalCustomers = await ds.getRepository(Customer).count({
    where: { restaurantId },
  });

  return NextResponse.json({
    kpis: {
      totalCalls,
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      conversionRate,
      avgCallDuration,
      avgDistance,
      maxConcurrent,
      totalDeliveries,
      totalMinutes,
      costToday,
      uniqueCallers,
      totalCustomers,
    },
    hourlyData,
    weeklyData,
    distanceData,
    outcomeData,
    recentCalls,
    topCustomers: topCustomersData,
  });
}
