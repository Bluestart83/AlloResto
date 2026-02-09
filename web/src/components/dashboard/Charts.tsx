"use client";

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import type { HourlyStats, DistanceStats, WeeklyStats, OutcomeStats } from "@/types";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 } } },
  },
};

// ---- Heures de pointe ----

export function HourlyChart({ data }: { data: HourlyStats[] }) {
  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-clock text-muted"></i>
        <h6>Heures de pointe</h6>
      </div>
      <div className="card-body" style={{ height: 280 }}>
        <Bar
          data={{
            labels: data.map((d) => `${d.hour}h`),
            datasets: [
              {
                label: "Appels",
                data: data.map((d) => d.calls),
                backgroundColor: "#818cf8",
                borderRadius: 4,
              },
              {
                label: "Simultanés",
                data: data.map((d) => d.concurrent),
                backgroundColor: "#ef4444",
                borderRadius: 4,
              },
            ],
          }}
          options={{
            ...chartOptions,
            plugins: { legend: { display: true, position: "top", labels: { font: { size: 11 } } } },
          }}
        />
      </div>
    </div>
  );
}

// ---- Distance clients ----

export function DistanceChart({ data }: { data: DistanceStats[] }) {
  const colors = ["#10b981", "#10b981", "#10b981", "#f59e0b", "#f59e0b", "#ef4444"];

  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-geo-alt text-muted"></i>
        <h6>Distance clients (livraison)</h6>
      </div>
      <div className="card-body" style={{ height: 280 }}>
        <Bar
          data={{
            labels: data.map((d) => d.range),
            datasets: [{
              label: "Livraisons",
              data: data.map((d) => d.count),
              backgroundColor: colors,
              borderRadius: 6,
            }],
          }}
          options={chartOptions}
        />
      </div>
    </div>
  );
}

// ---- Performance semaine ----

export function WeeklyChart({ data }: { data: WeeklyStats[] }) {
  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-graph-up text-muted"></i>
        <h6>Performance semaine</h6>
      </div>
      <div className="card-body" style={{ height: 280 }}>
        <Line
          data={{
            labels: data.map((d) => d.day),
            datasets: [
              {
                label: "Appels",
                data: data.map((d) => d.calls),
                borderColor: "#818cf8",
                backgroundColor: "rgba(129,140,248,0.1)",
                fill: true,
                tension: 0.3,
              },
              {
                label: "Commandes",
                data: data.map((d) => d.orders),
                borderColor: "#10b981",
                backgroundColor: "rgba(16,185,129,0.1)",
                fill: true,
                tension: 0.3,
              },
              {
                label: "Coût (€)",
                data: data.map((d) => d.cost),
                borderColor: "#f59e0b",
                borderDash: [5, 5],
                fill: false,
                tension: 0.3,
              },
            ],
          }}
          options={{
            ...chartOptions,
            plugins: { legend: { display: true, position: "top", labels: { font: { size: 11 } } } },
          }}
        />
      </div>
    </div>
  );
}

// ---- Résultats appels (donut) ----

export function OutcomeChart({ data }: { data: OutcomeStats[] }) {
  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-pie-chart text-muted"></i>
        <h6>Résultats appels</h6>
      </div>
      <div className="card-body">
        <div style={{ height: 200, display: "flex", justifyContent: "center" }}>
          <Doughnut
            data={{
              labels: data.map((d) => d.name),
              datasets: [{
                data: data.map((d) => d.value),
                backgroundColor: data.map((d) => d.color),
                borderWidth: 0,
                spacing: 3,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "65%",
              plugins: { legend: { display: false } },
            }}
          />
        </div>
        <div className="mt-3">
          {data.map((d) => (
            <div key={d.name} className="d-flex justify-content-between align-items-center mb-1"
              style={{ fontSize: "0.85rem" }}>
              <div className="d-flex align-items-center gap-2">
                <span className="rounded-circle d-inline-block"
                  style={{ width: 10, height: 10, backgroundColor: d.color }}></span>
                <span className="text-muted">{d.name}</span>
              </div>
              <span className="font-monospace fw-medium">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Temps gagné ----

export function TimeSavedCard({ avgAi, avgHuman, totalSavedMin }: {
  avgAi: number;
  avgHuman: number;
  totalSavedMin: number;
}) {
  const pctSaved = Math.round(((avgHuman - avgAi) / avgHuman) * 100);
  const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
  const eqEmployees = (totalSavedMin / 60 / 8).toFixed(1);

  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-lightning-charge text-muted"></i>
        <h6>Temps gagné par l'IA</h6>
      </div>
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-6">
            <div className="bg-light rounded-3 p-3 text-center">
              <div className="fw-bold fs-4">{fmtDuration(avgAi)}</div>
              <small className="text-muted">Durée moy. IA</small>
            </div>
          </div>
          <div className="col-6">
            <div className="bg-light rounded-3 p-3 text-center">
              <div className="fw-bold fs-4 text-decoration-line-through text-muted">
                {fmtDuration(avgHuman)}
              </div>
              <small className="text-muted">Durée moy. humain</small>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.85rem" }}>
            <span className="text-muted">Gain par appel</span>
            <span className="fw-bold text-success">{pctSaved}%</span>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <div className="progress-bar bg-success" style={{ width: `${pctSaved}%` }}></div>
          </div>
        </div>

        <div className="mb-3">
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.85rem" }}>
            <span className="text-muted">Total économisé aujourd'hui</span>
            <span className="fw-bold text-success">{Math.floor(totalSavedMin / 60)}h {totalSavedMin % 60}min</span>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <div className="progress-bar bg-primary"
              style={{ width: `${Math.min(100, (totalSavedMin / (8 * 60)) * 100)}%` }}></div>
          </div>
        </div>

        <div className="alert alert-primary py-2 px-3 mb-0" style={{ fontSize: "0.8rem" }}>
          <strong>💡</strong> Équivalent de <strong>{eqEmployees} employés à temps plein</strong> économisés
        </div>
      </div>
    </div>
  );
}
