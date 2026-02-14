import { NextResponse } from "next/server";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";

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
  host: string;
  wsUrl: string;
  sipRegistered: boolean;
}

/**
 * GET /api/admin/servers
 * Returns workers + agents + bridges from sip-agent-server.
 */
export async function GET() {
  let workers: WorkerInfo[] = [];
  let agents: AgentInfo[] = [];
  let bridges: BridgeInfo[] = [];
  let serverOnline = false;

  try {
    const [workersResp, agentsResp, bridgesResp] = await Promise.all([
      fetch(`${SIP_AGENT_SERVER_URL}/api/workers`, {
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`${SIP_AGENT_SERVER_URL}/api/agents`, {
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`${SIP_AGENT_SERVER_URL}/api/bridges`, {
        signal: AbortSignal.timeout(3000),
      }),
    ]);

    if (workersResp.ok) {
      const data = await workersResp.json();
      workers = data.workers || data;
      serverOnline = true;
    }

    if (agentsResp.ok) {
      agents = await agentsResp.json();
      serverOnline = true;
    }

    if (bridgesResp.ok) {
      const data = await bridgesResp.json();
      bridges = data.bridges || [];
    }
  } catch {
    // sip-agent-server is offline
  }

  return NextResponse.json({ workers, agents, bridges, serverOnline });
}
