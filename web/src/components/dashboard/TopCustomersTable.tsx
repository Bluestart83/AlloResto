"use client";

import type { TopCustomer } from "@/types";
import { formatPhoneDisplay } from "@/lib/format-phone";

const rankColors = ["bg-warning", "secondary bg-opacity-50", "bg-danger bg-opacity-75", "bg-secondary bg-opacity-25"];

export default function TopCustomersTable({ customers }: { customers: TopCustomer[] }) {
  return (
    <div className="chart-card">
      <div className="card-header d-flex align-items-center gap-2">
        <i className="bi bi-people text-muted"></i>
        <h6>Clients fidèles</h6>
      </div>
      <div className="card-body">
        {customers.map((c, i) => (
          <div key={i} className="d-flex align-items-center gap-3 p-2 rounded-3 mb-1"
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <div
              className={`rounded-circle d-flex align-items-center justify-content-center text-white fw-bold ${
                i === 0 ? "bg-warning" : i === 1 ? "bg-secondary" : i === 2 ? "bg-danger" : "bg-light text-dark"
              }`}
              style={{ width: 32, height: 32, fontSize: "0.8rem" }}
            >
              {i + 1}
            </div>
            <div className="flex-grow-1 min-width-0">
              <div className="fw-medium text-truncate">{c.name}</div>
              <small className="text-muted">{formatPhoneDisplay(c.phone)} · {c.lastOrder}</small>
            </div>
            <div className="text-end">
              <div className="font-monospace fw-bold">{c.spent.toFixed(0)}€</div>
              <small className="text-muted">{c.orders} cmd</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
