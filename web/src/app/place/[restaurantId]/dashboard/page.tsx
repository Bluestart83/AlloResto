"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  StatCard,
  HourlyChart, DistanceChart, WeeklyChart, OutcomeChart, TimeSavedCard,
  RecentCallsTable, TopCustomersTable,
} from "@/components/dashboard";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20AC", USD: "$", GBP: "\u00A3", CHF: "CHF",
};

interface StatsData {
  displayCurrency: string;
  displayFx: number;
  kpis: {
    totalCalls: number;
    totalOrders: number;
    totalRevenue: number;
    conversionRate: number;
    avgCallDuration: number;
    avgDistance: number;
    maxConcurrent: number;
    totalDeliveries: number;
    totalMinutes: number;
    costToday: number;
    costTodayAi: number;
    costTodayTelecom: number;
    uniqueCallers: number;
    totalCustomers: number;
    totalTokens: number;
  };
  hourlyData: { hour: number; calls: number; concurrent: number }[];
  weeklyData: { day: string; calls: number; orders: number; revenue: number; cost: number }[];
  distanceData: { range: string; count: number; pct: number }[];
  outcomeData: { name: string; value: number; color: string }[];
  recentCalls: any[];
  topCustomers: any[];
}

export default function RealDashboardPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/stats?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [restaurantId]);

  if (loading) {
    return <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>;
  }

  if (!stats) {
    return <div className="text-center py-5 text-muted">Erreur de chargement</div>;
  }

  const { kpis } = stats;
  const sym = CURRENCY_SYMBOLS[stats.displayCurrency] || stats.displayCurrency;

  const avgDurationStr = kpis.avgCallDuration > 0
    ? `${Math.floor(kpis.avgCallDuration / 60)}:${String(kpis.avgCallDuration % 60).padStart(2, "0")}`
    : "0:00";

  const timeSavedPct = kpis.avgCallDuration > 0 && kpis.avgCallDuration < 420
    ? Math.round((1 - kpis.avgCallDuration / 420) * 100)
    : 0;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Dashboard</h4>
          <small className="text-muted">Aujourd&apos;hui &mdash; donn&eacute;es r&eacute;elles</small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="live-dot"></span>
          <span className="text-success fw-medium" style={{ fontSize: "0.85rem" }}>IA Active</span>
        </div>
      </div>

      {/* KPIs Row 1 */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-telephone-inbound" iconBg="#eef2ff" label="Appels re&ccedil;us" value={kpis.totalCalls} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-bag-check" iconBg="#d1fae5" label="Commandes" value={kpis.totalOrders} subtitle={`${kpis.conversionRate}% conversion`} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-currency-euro" iconBg="#fef3c7" label="CA du jour" value={`${kpis.totalRevenue.toFixed(2)}${sym}`} subtitle={kpis.totalCalls > 0 ? `${(kpis.totalRevenue / kpis.totalCalls).toFixed(2)}${sym}/appel` : undefined} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-reception-4" iconBg="#ede9fe" label="Simultan&eacute;s max" value={kpis.maxConcurrent} />
        </div>
      </div>

      {/* KPIs Row 2 */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-stopwatch" iconBg="#e0f2fe" label="Dur&eacute;e moy." value={avgDurationStr} subtitle="vs 7:00 manuel" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-lightning-charge" iconBg="#d1fae5" label="Temps gagn&eacute;" value={`${timeSavedPct}%`} subtitle={`${kpis.totalMinutes} min trait&eacute;es`} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-geo-alt" iconBg="#ffe4e6" label="Distance moy." value={kpis.avgDistance > 0 ? `${kpis.avgDistance} km` : "\u2014"} subtitle={`${kpis.totalDeliveries} livraison(s)`} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-people" iconBg="#eef2ff" label="Appelants uniques" value={kpis.uniqueCallers} subtitle={`${kpis.totalCustomers} clients au total`} />
        </div>
      </div>

      {/* Costs — already converted to restaurant currency by API */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-cash-stack" iconBg="#fef3c7" label="Co&ucirc;t IA" value={`${kpis.costTodayAi.toFixed(2)}${sym}`} subtitle={`${kpis.totalTokens > 0 ? `${(kpis.totalTokens / 1000).toFixed(1)}k tokens` : "0 tokens"}`} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-telephone" iconBg="#e0f2fe" label="Co&ucirc;t t&eacute;l&eacute;com" value={`${kpis.costTodayTelecom.toFixed(2)}${sym}`} subtitle={`${kpis.totalMinutes} min`} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-wallet2" iconBg="#ede9fe" label="Co&ucirc;t total" value={`${kpis.costToday.toFixed(2)}${sym}`} subtitle={kpis.totalCalls > 0 ? `${(kpis.costToday / kpis.totalCalls).toFixed(3)}${sym}/appel` : undefined} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-graph-up-arrow" iconBg="#d1fae5" label="Marge" value={kpis.totalRevenue > 0 ? `${((1 - kpis.costToday / kpis.totalRevenue) * 100).toFixed(0)}%` : "\u2014"} subtitle={`CA: ${kpis.totalRevenue.toFixed(2)}${sym}`} />
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <HourlyChart data={stats.hourlyData} />
        </div>
        <div className="col-lg-6">
          <DistanceChart data={stats.distanceData} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <WeeklyChart data={stats.weeklyData} />
        </div>
        <div className="col-lg-4">
          <OutcomeChart data={stats.outcomeData} />
        </div>
      </div>

      {/* Time saved + Top customers */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <TimeSavedCard avgAi={kpis.avgCallDuration} avgHuman={420} totalSavedMin={kpis.totalMinutes > 0 ? Math.round(kpis.totalMinutes * timeSavedPct / 100) : 0} />
        </div>
        <div className="col-lg-6">
          <TopCustomersTable customers={stats.topCustomers} />
        </div>
      </div>

      {/* Recent calls */}
      <div className="mb-4">
        <RecentCallsTable calls={stats.recentCalls} />
      </div>

      {/* Empty state */}
      {kpis.totalCalls === 0 && (
        <div className="text-center py-4">
          <i className="bi bi-inbox fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucun appel aujourd&apos;hui. Les statistiques s&apos;afficheront d&egrave;s le premier appel.</p>
        </div>
      )}
    </>
  );
}
