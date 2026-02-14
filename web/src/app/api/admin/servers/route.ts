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

/**
 * GET /api/admin/servers
 * Returns workers + agents from sip-agent-server.
 */
export async function GET() {
  let workers: WorkerInfo[] = [];
  let agents: AgentInfo[] = [];
  let serverOnline = false;

  try {
    const [workersResp, agentsResp] = await Promise.all([
      fetch(`${SIP_AGENT_SERVER_URL}/api/workers`, {
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`${SIP_AGENT_SERVER_URL}/api/agents`, {
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
  } catch {
    // sip-agent-server is offline
  }

  return NextResponse.json({ workers, agents, serverOnline });
}
