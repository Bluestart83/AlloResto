"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { AgentConfigPanel } from "@nld/iagent-lib";
import type { AgentData, PhoneLineWithAgent } from "@nld/iagent-lib";

const SIP_PUBLIC_URL =
  process.env.NEXT_PUBLIC_SIP_AGENT_URL || "https://iagent.nolimitdev.net";

export default function AgentPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [allLines, setAllLines] = useState<PhoneLineWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const resp = await fetch(`/api/agent/${restaurantId}`);
      if (!resp.ok) {
        if (resp.status === 404) {
          setError("Aucun agent configuré pour ce restaurant. Activez le SIP ou le chat dans les paramètres.");
        } else {
          setError("Erreur chargement agent");
        }
        return;
      }
      const data = await resp.json();
      setAgent(data);
      setError(null);

      // Phone lines from agent data
      const lines: PhoneLineWithAgent[] = (data.phoneLines || []).map((pl: any) => ({
        ...pl,
        agentId: data.id,
        agentName: data.name,
      }));
      setAllLines(lines);
    } catch (err) {
      console.error("[AgentPage] fetch error:", err);
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = useCallback(
    async (agentId: string, data: Record<string, any>) => {
      const resp = await fetch(`/api/agent/${restaurantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Erreur sauvegarde");
      }
      await reload();
    },
    [restaurantId, reload],
  );

  const handleAssignLine = useCallback(
    async (lineId: string, toAgentId: string) => {
      // AlloResto: single agent, lines managed via phone-lines page
    },
    [],
  );

  if (loading) {
    return (
      <div className="d-flex justify-content-center p-5">
        <div className="spinner-border text-success" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="text-center py-5 text-muted">
        <i className="bi bi-robot" style={{ fontSize: "3rem" }} />
        <p className="mt-3">{error || "Agent introuvable"}</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">
        <i className="bi bi-robot me-2" />
        Configuration Agent IA
      </h4>
      <AgentConfigPanel
        agent={agent}
        allLines={allLines}
        sipPublicUrl={SIP_PUBLIC_URL}
        onSave={handleSave}
        onSavePartial={handleSave}
        onAssignLine={handleAssignLine}
        phoneLinesUrl={`/place/${restaurantId}/settings`}
        ttsApiBase={`/api/agent/${restaurantId}/tts`}
      />
    </div>
  );
}
