import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";

const SERVICE_MANAGER_URL =
  process.env.NEXT_PUBLIC_SERVICE_MANAGER_URL || "http://localhost:8090";

interface ManagerAgent {
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

/**
 * GET /api/admin/servers
 * Returns voice server list, merging DB restaurants + live status from service manager.
 */
export async function GET() {
  const ds = await getDb();

  // Fetch configured restaurants from DB
  const restaurants = await ds.getRepository(Restaurant).find({
    where: { isActive: true, sipEnabled: true },
    relations: ["phoneLine"],
  });

  const dbAgents = restaurants
    .filter((r) => r.phoneLine?.isActive)
    .map((r) => ({
      restaurantId: r.id,
      restaurantName: r.name,
      sipBridge: r.sipBridge,
      phoneNumber: r.phoneLine?.phoneNumber || "",
    }));

  // Try to get live status from service manager
  let managerAgents: ManagerAgent[] = [];
  let managerOnline = false;

  try {
    const resp = await fetch(`${SERVICE_MANAGER_URL}/agents`, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      managerAgents = await resp.json();
      managerOnline = true;
    }
  } catch {
    // Service manager is offline
  }

  // Merge: prefer service manager data, fallback to DB
  const managerMap = new Map(managerAgents.map((a) => [a.restaurantId, a]));

  const merged = dbAgents.map((db) => {
    const live = managerMap.get(db.restaurantId);
    if (live) {
      return { ...live };
    }
    return {
      restaurantId: db.restaurantId,
      restaurantName: db.restaurantName,
      state: "unknown",
      sipBridge: db.sipBridge,
      ports: { app: 0, bridge: null },
      pids: { app: null, bridge: null },
      activeCalls: 0,
      uptimeSeconds: 0,
      restartCount: 0,
      lastHealthCheck: null,
    };
  });

  return NextResponse.json({ agents: merged, managerOnline });
}

/**
 * POST /api/admin/servers
 * Proxy actions (start/stop/restart/refresh) to the service manager.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, restaurantId } = body;

  if (action === "refresh") {
    try {
      const resp = await fetch(`${SERVICE_MANAGER_URL}/refresh`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json(
        { error: "Service Manager inaccessible" },
        { status: 502 }
      );
    }
  }

  if (!restaurantId || !["start", "stop", "restart"].includes(action)) {
    return NextResponse.json(
      { error: "restaurantId et action (start/stop/restart) requis" },
      { status: 400 }
    );
  }

  try {
    const resp = await fetch(
      `${SERVICE_MANAGER_URL}/agents/${restaurantId}/${action}`,
      { method: "POST", signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || `HTTP ${resp.status}` },
        { status: resp.status }
      );
    }
    const data = await resp.json().catch(() => ({ ok: true }));
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Service Manager inaccessible" },
      { status: 502 }
    );
  }
}
