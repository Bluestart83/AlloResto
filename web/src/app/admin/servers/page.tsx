"use client";

import { useState, useEffect, useCallback } from "react";

interface WorkerInfo {
  workerId: string;
  host: string;
  port: number;
  wsUrl: string;
  activeCalls: number;
  maxCalls: number;
}

interface AgentInfo {
  id: string;
  name: string;
  transportType: string;
  isActive: boolean;
  externalSessionUrl: string | null;
  config: Record<string, any>;
}

interface BridgeInfo {
  phoneLineId: string;
  agentId: string;
  sipRegistered: boolean;
}

export default function ServersPage() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [bridgeMap, setBridgeMap] = useState<Record<string, BridgeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/servers");
      if (resp.ok) {
        const data = await resp.json();
        setWorkers(data.workers);
        setAgents(data.agents);
        setServerOnline(data.serverOnline);
        const map: Record<string, BridgeInfo> = {};
        for (const b of (data.bridges || [])) {
          map[b.agentId] = b;
        }
        setBridgeMap(map);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalCalls = workers.reduce((sum, w) => sum + w.activeCalls, 0);
  const totalCapacity = workers.reduce((sum, w) => sum + w.maxCalls, 0);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Serveurs Vocaux</h4>
          <small className="text-muted">
            {workers.length} worker(s) en ligne &middot; {totalCalls}/{totalCapacity} appel(s)
          </small>
        </div>
        <button className="btn btn-outline-primary btn-sm" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise me-1"></i>Rafra&icirc;chir
        </button>
      </div>

      {!serverOnline && !loading && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-4">
          <i className="bi bi-exclamation-triangle"></i>
          <div>
            <strong>SIP Agent Server hors ligne</strong>
            <div className="small">
              Le serveur d&apos;agents vocaux n&apos;est pas accessible. V&eacute;rifiez que le service est d&eacute;marr&eacute;.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : (
        <>
          {/* Workers */}
          <h5 className="fw-semibold mb-3">
            <i className="bi bi-hdd-stack me-2 text-primary"></i>
            Workers
          </h5>

          {workers.length === 0 ? (
            <div className="card mb-4">
              <div className="card-body text-center text-muted py-4">
                <i className="bi bi-hdd-stack fs-1 d-block mb-2"></i>
                Aucun worker en ligne
              </div>
            </div>
          ) : (
            <div className="row g-3 mb-4">
              {workers.map((w) => {
                const usage = w.maxCalls > 0 ? (w.activeCalls / w.maxCalls) * 100 : 0;
                return (
                  <div key={w.workerId} className="col-md-6 col-lg-4">
                    <div className="card h-100">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <h6 className="mb-0 fw-semibold">
                              <i className="bi bi-hdd-stack me-1 text-primary"></i>
                              {w.workerId}
                            </h6>
                            <small className="text-muted font-monospace">{w.host}:{w.port}</small>
                          </div>
                          <span className="badge bg-success">En ligne</span>
                        </div>
                        <div>
                          <small className="text-muted">Appels actifs</small>
                          <div className="progress mt-1" style={{ height: 6 }}>
                            <div
                              className={`progress-bar ${usage > 80 ? "bg-danger" : usage > 50 ? "bg-warning" : "bg-success"}`}
                              style={{ width: `${usage}%` }}
                            />
                          </div>
                          <small>{w.activeCalls} / {w.maxCalls}</small>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Agents */}
          <h5 className="fw-semibold mb-3">
            <i className="bi bi-robot me-2 text-primary"></i>
            Agents configur&eacute;s
          </h5>

          {agents.length === 0 ? (
            <div className="card">
              <div className="card-body text-center text-muted py-4">
                <i className="bi bi-robot fs-1 d-block mb-2"></i>
                Aucun agent configur&eacute;
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Transport</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>SIP</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const bridge = bridgeMap[a.id];
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="fw-semibold">{a.name}</div>
                          <small className="text-muted font-monospace" style={{ fontSize: "0.7rem" }}>
                            {a.id.slice(0, 8)}
                          </small>
                        </td>
                        <td>
                          <span className={`badge ${a.transportType === "sip_bridge" ? "bg-primary" : "bg-info"}`} style={{ fontSize: "0.7rem" }}>
                            {a.transportType === "sip_bridge" ? "SIP Bridge" : "Twilio"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${a.externalSessionUrl ? "bg-secondary" : "bg-dark"}`} style={{ fontSize: "0.7rem" }}>
                            {a.externalSessionUrl ? "External" : "Standard"}
                          </span>
                        </td>
                        <td>
                          {a.isActive ? (
                            <span className="badge bg-success">Actif</span>
                          ) : (
                            <span className="badge bg-secondary">Inactif</span>
                          )}
                        </td>
                        <td>
                          {bridge ? (
                            bridge.sipRegistered ? (
                              <span className="badge bg-success">
                                <i className="bi bi-telephone-fill me-1"></i>
                                Registered
                              </span>
                            ) : (
                              <span className="badge bg-danger">
                                <i className="bi bi-telephone-x me-1"></i>
                                Unregistered
                              </span>
                            )
                          ) : (
                            <span className="badge bg-light text-muted">
                              <i className="bi bi-telephone me-1"></i>
                              Offline
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
