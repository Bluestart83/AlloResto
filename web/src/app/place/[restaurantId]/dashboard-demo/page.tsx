"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  StatCard, PricingCard,
  HourlyChart, DistanceChart, WeeklyChart, OutcomeChart, TimeSavedCard,
  RecentCallsTable, TopCustomersTable,
} from "@/components/dashboard";
import type { PricingConfig } from "@/types";

// ============================================================
// MOCK DATA — données de démonstration
// ============================================================

const hourlyData = Array.from({ length: 24 }, (_, h) => {
  const base = h >= 11 && h <= 14 ? 12 : h >= 18 && h <= 21 ? 18 : h >= 9 && h <= 22 ? 4 : 0;
  return { hour: h, calls: Math.max(0, base + Math.floor(Math.random() * 5 - 2)), concurrent: Math.min(base, Math.floor(Math.random() * 4) + 1) };
});

const weeklyData = [
  { day: "Lun", calls: 34, orders: 28, revenue: 486, cost: 18.2 },
  { day: "Mar", calls: 29, orders: 22, revenue: 391, cost: 15.4 },
  { day: "Mer", calls: 41, orders: 35, revenue: 612, cost: 22.1 },
  { day: "Jeu", calls: 38, orders: 30, revenue: 523, cost: 19.8 },
  { day: "Ven", calls: 52, orders: 44, revenue: 789, cost: 28.3 },
  { day: "Sam", calls: 61, orders: 51, revenue: 924, cost: 33.1 },
  { day: "Dim", calls: 47, orders: 39, revenue: 698, cost: 25.7 },
];

const distanceData = [
  { range: "0-1 km", count: 42, pct: 18 },
  { range: "1-2 km", count: 67, pct: 29 },
  { range: "2-3 km", count: 54, pct: 23 },
  { range: "3-4 km", count: 38, pct: 16 },
  { range: "4-5 km", count: 22, pct: 10 },
  { range: "5+ km", count: 9, pct: 4 },
];

const outcomeData = [
  { name: "Commande", value: 249, color: "#10b981" },
  { name: "Info seul.", value: 42, color: "#6366f1" },
  { name: "Abandonné", value: 28, color: "#f59e0b" },
  { name: "Erreur", value: 5, color: "#ef4444" },
];

const recentCalls = [
  { id: "1", callerNumber: "06 12 34 56 78", customerName: "Mohamed", duration: 187, outcome: "order_placed" as const, total: 34.50, orderType: "delivery" as const, distance: 2.3, time: "12:34" },
  { id: "2", callerNumber: "06 98 76 54 32", customerName: "Sarah", duration: 142, outcome: "order_placed" as const, total: 22.00, orderType: "pickup" as const, distance: null, time: "12:28" },
  { id: "3", callerNumber: "07 11 22 33 44", customerName: null, duration: 45, outcome: "abandoned" as const, total: 0, orderType: null, distance: null, time: "12:15" },
  { id: "4", callerNumber: "06 55 44 33 22", customerName: "Karim", duration: 210, outcome: "order_placed" as const, total: 47.80, orderType: "delivery" as const, distance: 3.8, time: "12:02" },
  { id: "5", callerNumber: "06 77 88 99 00", customerName: "Julie", duration: 98, outcome: "info_only" as const, total: 0, orderType: null, distance: null, time: "11:47" },
];

const topCustomers = [
  { name: "Mohamed A.", phone: "06 12 **", orders: 23, spent: 782.50, lastOrder: "Aujourd'hui" },
  { name: "Karim B.", phone: "06 55 **", orders: 18, spent: 643.20, lastOrder: "Hier" },
  { name: "Sarah L.", phone: "06 98 **", orders: 15, spent: 412.00, lastOrder: "Aujourd'hui" },
  { name: "Julie M.", phone: "06 77 **", orders: 12, spent: 389.80, lastOrder: "Il y a 3j" },
  { name: "Youssef K.", phone: "07 22 **", orders: 9, spent: 298.50, lastOrder: "Il y a 2j" },
];

// ============================================================
// PAGE
// ============================================================

export default function RestaurantDashboardPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [pricing, setPricing] = useState<PricingConfig>({
    monthlyCost: 49.90,
    perMinute: 0.12,
    currency: "€",
  });

  // TODO: fetch real stats from /api/stats?restaurantId=xxx
  // For now, using mock data

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Dashboard</h4>
          <small className="text-muted">Aujourd&apos;hui — données de démonstration</small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="live-dot"></span>
          <span className="text-success fw-medium" style={{ fontSize: "0.85rem" }}>
            IA Active
          </span>
        </div>
      </div>

      {/* KPIs Row 1 */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-telephone-inbound" iconBg="#eef2ff" label="Appels reçus" value={324} trend="+12%" trendUp />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-bag-check" iconBg="#d1fae5" label="Commandes" value={249} subtitle="76.9% conversion" trend="+8%" trendUp />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-currency-euro" iconBg="#fef3c7" label="CA du jour" value="4 423€" subtitle="13.65€/appel" trend="+15%" trendUp />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-reception-4" iconBg="#ede9fe" label="Simultanés max" value={4} subtitle="pic à 12h34" />
        </div>
      </div>

      {/* KPIs Row 2 */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-stopwatch" iconBg="#e0f2fe" label="Durée moy." value="3:51" subtitle="vs 7:00 manuel" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-lightning-charge" iconBg="#d1fae5" label="Temps gagné" value="45%" subtitle="17h02 économisées" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-geo-alt" iconBg="#ffe4e6" label="Distance moy." value="2.4 km" subtitle="232 livraisons" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-people" iconBg="#eef2ff" label="Clients fidèles" value={67} subtitle="≥ 3 commandes" trend="+5" trendUp />
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-4">
        <PricingCard pricing={pricing} onPricingChange={setPricing} totalMinutes={1247} totalRevenue={4423} />
      </div>

      {/* Charts Row 1 */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <HourlyChart data={hourlyData} />
        </div>
        <div className="col-lg-6">
          <DistanceChart data={distanceData} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <WeeklyChart data={weeklyData} />
        </div>
        <div className="col-lg-4">
          <OutcomeChart data={outcomeData} />
        </div>
      </div>

      {/* Time saved + Top customers */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <TimeSavedCard avgAi={231} avgHuman={420} totalSavedMin={1022} />
        </div>
        <div className="col-lg-6">
          <TopCustomersTable customers={topCustomers} />
        </div>
      </div>

      {/* Recent calls */}
      <div className="mb-4">
        <RecentCallsTable calls={recentCalls} />
      </div>
    </>
  );
}
