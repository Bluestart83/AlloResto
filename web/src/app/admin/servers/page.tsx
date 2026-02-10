"use client";

import { useState, useEffect, useCallback } from "react";

const SERVICE_MANAGER_URL =
  process.env.NEXT_PUBLIC_SERVICE_MANAGER_URL || "http://localhost:8080";

interface AgentInfo {
  restaurantId: string;
  restaurantName: string;
  state: string;
  sipBridge: boolean;
  ports: { app: number; bridge: number | null };
  pids: { app: number | null; bridge: number | null };
  activeCalls: number;
  uptimeSeconds: number;
  restartCount: number;
  lastHealthCheck: string | null;
}

type SortKey = "restaurantName" | "state" | "activeCalls";

const STATE_ORDER: Record<string, number> = {
  running: 0,
  unhealthy: 1,
  starting: 2,
  failed: 3,
  stopping: 4,
  stopped: 5,
};

function stateBadge(state: string) {
  const map: Record<string, { cls: string; label: string }> = {
    running: { cls: "bg-success", label: "Running" },
    starting: { cls: "bg-info", label: "Starting" },
    unhealthy: { cls: "bg-warning text-dark", label: "Unhealthy" },
    failed: { cls: "bg-danger", label: "Failed" },
    stopped: { cls: "bg-secondary", label: "Stopped" },
    stopping: { cls: "bg-secondary", label: "Stopping" },
  };
  const s = map[state] || { cls: "bg-secondary", label: state };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export default function ServersPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("restaurantName");
  const [sortAsc, setSortAsc] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const resp = await fetch(`${SERVICE_MANAGER_URL}/agents`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setAgents(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Connexion au service manager impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10_000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleAction = async (restaurantId: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${restaurantId}:${action}`);
    try {
      const resp = await fetch(`${SERVICE_MANAGER_URL}/agents/${restaurantId}/${action}`, {
        method: "POST",
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${resp.status}`);
      }
      await fetchAgents();
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    try {
      await fetch(`${SERVICE_MANAGER_URL}/refresh`, { method: "POST" });
      await fetchAgents();
    } catch {
      // ignore
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <i className="bi bi-chevron-expand text-muted ms-1" style={{ fontSize: "0.7rem" }} />;
    return <i className={`bi bi-chevron-${sortAsc ? "up" : "down"} ms-1`} style={{ fontSize: "0.7rem" }} />;
  };

  const filtered = agents
    .filter((a) => a.restaurantName.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "restaurantName":
          cmp = a.restaurantName.localeCompare(b.restaurantName);
          break;
        case "state":
          cmp = (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99);
          break;
        case "activeCalls":
          cmp = a.activeCalls - b.activeCalls;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

  const totalCalls = agents.reduce((sum, a) => sum + a.activeCalls, 0);
  const runningCount = agents.filter((a) => a.state === "running").length;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Serveurs Vocaux</h4>
          <small className="text-muted">
            {runningCount}/{agents.length} actif(s) &middot; {totalCalls} appel(s) en cours
          </small>
        </div>
        <button className="btn btn-outline-primary btn-sm" onClick={handleRefresh}>
          <i className="bi bi-arrow-clockwise me-1"></i>Rafraîchir
        </button>
      </div>

      {/* Search */}
      <div className="input-group mb-4" style={{ maxWidth: 400 }}>
        <span className="input-group-text bg-dark border-secondary">
          <i className="bi bi-search text-muted"></i>
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Filtrer par nom client..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-4">
          <i className="bi bi-exclamation-triangle"></i>
          <div>
            <strong>Service Manager inaccessible</strong>
            <div className="small">{error}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : agents.length === 0 && !error ? (
        <div className="text-center py-5">
          <i className="bi bi-hdd-rack fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucun agent vocal configuré</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle">
            <thead>
              <tr>
                <th role="button" onClick={() => handleSort("restaurantName")} style={{ cursor: "pointer" }}>
                  Nom {sortIcon("restaurantName")}
                </th>
                <th role="button" onClick={() => handleSort("state")} style={{ cursor: "pointer" }}>
                  Status {sortIcon("state")}
                </th>
                <th role="button" onClick={() => handleSort("activeCalls")} style={{ cursor: "pointer" }}>
                  Appels {sortIcon("activeCalls")}
                </th>
                <th>Mode</th>
                <th>Uptime</th>
                <th>Ports</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const isActionLoading = actionLoading?.startsWith(a.restaurantId);
                return (
                  <tr key={a.restaurantId}>
                    <td>
                      <div className="fw-semibold">{a.restaurantName}</div>
                      <small className="text-muted font-monospace" style={{ fontSize: "0.7rem" }}>
                        {a.restaurantId.slice(0, 8)}
                      </small>
                    </td>
                    <td>
                      {a.state === "starting" ? (
                        <span className="badge bg-info">
                          <span className="spinner-border spinner-border-sm me-1" style={{ width: "0.7rem", height: "0.7rem" }}></span>
                          Starting
                        </span>
                      ) : (
                        stateBadge(a.state)
                      )}
                      {a.restartCount > 0 && (
                        <small className="text-muted ms-1" title="Nombre de restarts">
                          ({a.restartCount}x)
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={a.activeCalls > 0 ? "text-success fw-bold" : "text-muted"}>
                        {a.activeCalls}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${a.sipBridge ? "bg-primary" : "bg-info"}`} style={{ fontSize: "0.7rem" }}>
                        {a.sipBridge ? "SIP Bridge" : "Twilio"}
                      </span>
                    </td>
                    <td className="text-muted">{formatUptime(a.uptimeSeconds)}</td>
                    <td>
                      <small className="font-monospace text-muted">
                        {a.ports.app}
                        {a.ports.bridge ? ` / ${a.ports.bridge}` : ""}
                      </small>
                    </td>
                    <td className="text-end">
                      {a.state === "stopped" || a.state === "failed" ? (
                        <button
                          className="btn btn-outline-success btn-sm"
                          onClick={() => handleAction(a.restaurantId, "start")}
                          disabled={!!isActionLoading}
                        >
                          {isActionLoading ? (
                            <span className="spinner-border spinner-border-sm"></span>
                          ) : (
                            <><i className="bi bi-play-fill me-1"></i>Start</>
                          )}
                        </button>
                      ) : (
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-outline-warning"
                            onClick={() => handleAction(a.restaurantId, "restart")}
                            disabled={!!isActionLoading}
                            title="Restart"
                          >
                            <i className="bi bi-arrow-repeat"></i>
                          </button>
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => handleAction(a.restaurantId, "stop")}
                            disabled={!!isActionLoading}
                            title="Stop"
                          >
                            <i className="bi bi-stop-fill"></i>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && agents.length > 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    Aucun résultat pour &laquo; {filter} &raquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
