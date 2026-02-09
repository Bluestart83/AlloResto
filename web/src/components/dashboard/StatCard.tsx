"use client";

interface Props {
  icon: string;
  iconBg: string;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ icon, iconBg, label, value, subtitle, trend, trendUp }: Props) {
  return (
    <div className="stat-card bg-white p-3">
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value mt-1">{value}</div>
          {subtitle && (
            <div className="text-muted mt-1" style={{ fontSize: "0.8rem" }}>
              {subtitle}
            </div>
          )}
        </div>
        <div className="stat-icon" style={{ backgroundColor: iconBg }}>
          <i className={`bi ${icon}`}></i>
        </div>
      </div>
      {trend && (
        <div className="mt-2" style={{ fontSize: "0.8rem" }}>
          <span className={trendUp ? "text-success" : "text-danger"}>
            <i className={`bi ${trendUp ? "bi-caret-up-fill" : "bi-caret-down-fill"} me-1`}></i>
            {trend}
          </span>
          <span className="text-muted ms-1">vs sem. préc.</span>
        </div>
      )}
    </div>
  );
}
