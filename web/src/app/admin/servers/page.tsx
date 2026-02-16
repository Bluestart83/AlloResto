"use client";

import { useState, useEffect, useCallback } from "react";

type PushState = "idle" | "pushing" | "done" | "error";

interface AgentInfo {
  id: string;
  name: string;
  transportType: string;
  isActive: boolean;
  pauseReason: string | null;
  externalSessionUrl: string | null;
}

interface BridgeInfo {
  phoneLineId: string;
  agentId: string;
  sipRegistered: boolean;
  lastCodec: string;
}

export default function ServersPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [bridgeMap, setBridgeMap] = useState<Record<string, BridgeInfo>>({});
  const [activeCallsMap, setActiveCallsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  const [pushState, setPushState] = useState<PushState>("idle");
  const [pushResult, setPushResult] = useState<{ success: number; failed: number } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/servers");
      if (resp.ok) {
        const data = await resp.json();
        setAgents(data.agents);
        setServerOnline(data.serverOnline);
        const map: Record<string, BridgeInfo> = {};
        for (const b of (data.bridges || [])) {
          map[b.agentId] = b;
        }
        setBridgeMap(map);
        setActiveCallsMap(data.activeCalls || {});
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

  async function handlePushBrain() {
    setPushState("pushing");
    setPushResult(null);
    try {
      const resp = await fetch("/api/admin/push-brain", { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        setPushResult(data);
        setPushState("done");
        fetchData();
      } else {
        setPushState("error");
      }
    } catch {
      setPushState("error");
    }
  }

  const totalCalls = Object.values(activeCallsMap).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Agents Vocaux</h4>
          <small className="text-muted">
            {agents.length} agent(s) &middot; {totalCalls} appel(s) en cours
          </small>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <button
            className="btn btn-outline-warning btn-sm"
            onClick={handlePushBrain}
            disabled={pushState === "pushing" || !serverOnline}
            title="Mettre a jour le brain (prompt + tools) sur tous les agents"
          >
            {pushState === "pushing" ? (
              <span className="spinner-border spinner-border-sm me-1" />
            ) : (
              <i className="bi bi-lightning-charge me-1"></i>
            )}
            Push Brain
          </button>
          {pushState === "done" && pushResult && (
            <small className="text-success">
              <i className="bi bi-check-circle me-1"></i>
              {pushResult.success} OK{pushResult.failed > 0 && `, ${pushResult.failed} echec`}
            </small>
          )}
          {pushState === "error" && (
            <small className="text-danger">
              <i className="bi bi-x-circle me-1"></i>Erreur
            </small>
          )}
          <button className="btn btn-outline-primary btn-sm" onClick={fetchData}>
            <i className="bi bi-arrow-clockwise me-1"></i>Rafra&icirc;chir
          </button>
        </div>
      </div>

      {!serverOnline && !loading && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-4">
          <i className="bi bi-exclamation-triangle"></i>
          <div>
            <strong>Serveur vocal hors ligne</strong>
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
      ) : agents.length === 0 ? (
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
                <th>Statut</th>
                <th>Appels</th>
                <th>SIP</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const bridge = bridgeMap[a.id];
                const calls = activeCallsMap[a.id] || 0;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="fw-semibold">
                        <i className="bi bi-robot me-1 text-primary"></i>
                        {a.name}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${a.transportType === "sip_bridge" ? "bg-primary" : "bg-info"}`} style={{ fontSize: "0.7rem" }}>
                        {a.transportType === "sip_bridge" ? "SIP Bridge" : "Twilio"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${a.isActive ? "bg-success" : a.pauseReason === "insufficient_balance" ? "bg-warning text-dark" : "bg-secondary"}`}>
                        {a.isActive ? "Actif" : a.pauseReason === "insufficient_balance" ? "Pause (solde)" : "Inactif"}
                      </span>
                    </td>
                    <td>
                      {calls > 0 ? (
                        <span className="badge bg-primary">
                          <i className="bi bi-telephone-forward me-1"></i>
                          {calls}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td>
                      {bridge ? (
                        bridge.sipRegistered ? (
                          <>
                            <span className="badge bg-success">
                              <i className="bi bi-telephone-fill me-1"></i>
                              Registered
                            </span>
                            {bridge.lastCodec && (
                              <small className="text-muted ms-1">
                                {/^PCM[AU]$/i.test(bridge.lastCodec) ? `G.711 (${bridge.lastCodec})` : bridge.lastCodec}
                              </small>
                            )}
                          </>
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
  );
}
