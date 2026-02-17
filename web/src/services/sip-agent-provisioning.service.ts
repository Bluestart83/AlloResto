/**
 * Auto-provisioning d'agents dans sip-agent-server.
 *
 * Quand un restaurant est cree dans AlloResto, ce service appelle l'API
 * de sip-agent-server pour creer un Account (si absent), un FinalCustomer,
 * un Agent, et les 12 ToolConfigs associes.
 *
 * Fire-and-forget : les erreurs sont loguees, jamais propagees.
 * Le restaurant est cree quoi qu'il arrive.
 */

import { ALLORESTO_TOOL_DEFINITIONS } from "./sip-agent-tool-definitions";

const SIP_AGENT_SERVER_URL =
  process.env.SIP_AGENT_SERVER_URL || "http://localhost:4000";
const ALLORESTO_URL =
  process.env.ALLORESTO_CALLBACK_URL || "http://alloresto:3000";

const ACCOUNT_NAME = "AlloResto";
const ACCOUNT_EMAIL = "admin@alloresto.local";

let cachedAccountId: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sipFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${SIP_AGENT_SERVER_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Account ──────────────────────────────────────────────────────────────────

async function ensureAccount(): Promise<string> {
  if (cachedAccountId) return cachedAccountId;

  // Cherche un account existant
  const listResp = await sipFetch("/accounts");
  if (listResp.ok) {
    const accounts = (await listResp.json()) as { id: string; name: string }[];
    const existing = accounts.find((a) => a.name === ACCOUNT_NAME);
    if (existing) {
      cachedAccountId = existing.id;
      return existing.id;
    }
  }

  // Crée le compte
  const createResp = await sipFetch("/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: ACCOUNT_NAME,
      email: ACCOUNT_EMAIL,
      isActive: true,
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Account creation failed (${createResp.status}): ${text}`);
  }

  const account = (await createResp.json()) as { id: string };
  cachedAccountId = account.id;
  console.log(`[sip-provisioning] Account created: ${account.id}`);
  return account.id;
}

// ─── FinalCustomer ───────────────────────────────────────────────────────────

async function ensureFinalCustomer(
  accountId: string,
  restaurant: { id: string; name: string; contactEmail?: string | null; phone?: string | null }
): Promise<string> {
  const createResp = await sipFetch("/final-customers", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      name: restaurant.name,
      email: restaurant.contactEmail || null,
      phone: restaurant.phone || null,
      currency: "EUR",
      costMarginPct: 30,
      isActive: true,
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`FinalCustomer creation failed (${createResp.status}): ${text}`);
  }

  const fc = (await createResp.json()) as { id: string };
  console.log(`[sip-provisioning] FinalCustomer created: ${fc.id}`);
  return fc.id;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export async function provisionAgent(restaurant: {
  id: string;
  name: string;
  aiVoice: string;
  timezone: string;
  contactEmail?: string | null;
  phone?: string | null;
  deliveryEnabled?: boolean;
  reservationEnabled?: boolean;
  orderStatusEnabled?: boolean;
  transferEnabled?: boolean;
  transferPhoneNumber?: string | null;
  transferAutomatic?: boolean;
  maxCallDurationSec?: number;
  sip?: {
    transport?: string;
    domain: string;
    username: string;
    password: string;
  } | null;
}): Promise<{ agentId: string | null; finalCustomerId: string | null }> {
  try {
    const accountId = await ensureAccount();

    // Crée le FinalCustomer
    const finalCustomerId = await ensureFinalCustomer(accountId, restaurant);

    // Crée l'agent
    const agentResp = await sipFetch("/agents", {
      method: "POST",
      body: JSON.stringify({
        accountId,
        finalCustomerId,
        name: restaurant.name,
        basePrompt: "={{data.systemPrompt}}",
        aiModel: "gpt-realtime",
        aiVoice: restaurant.aiVoice || "sage",
        vadThreshold: 0.5,
        vadSilenceMs: 500,
        vadPrefixPaddingMs: 300,
        temperature: 0.7,
        transportType: "sip_bridge",
        timezone: restaurant.timezone || "Europe/Paris",
        apiBaseUrl: ALLORESTO_URL,
        maxCallDurationSec: restaurant.maxCallDurationSec || 600,
        onCallEndWebhook: `={{BASE_URL}}/api/calls`,
        externalSessionUrl: `=${ALLORESTO_URL}/api/ai?restaurantId={{config.restaurantId}}&callerPhone={{callerPhone}}`,
        config: {
          restaurantId: restaurant.id,
          deliveryEnabled: restaurant.deliveryEnabled ?? true,
          reservationEnabled: restaurant.reservationEnabled ?? false,
          orderStatusEnabled: restaurant.orderStatusEnabled ?? true,
          transferEnabled: !!(restaurant.transferEnabled && restaurant.transferPhoneNumber && !restaurant.transferAutomatic),
        },
        sipTransport: restaurant.sip?.transport || null,
        sipDomain: restaurant.sip?.domain || null,
        sipUsername: restaurant.sip?.username || null,
        sipPassword: restaurant.sip?.password || null,
        isActive: true,
      }),
    });

    if (!agentResp.ok) {
      const text = await agentResp.text();
      console.error(
        `[sip-provisioning] Agent creation failed (${agentResp.status}): ${text}`
      );
      return { agentId: null, finalCustomerId };
    }

    const agent = (await agentResp.json()) as {
      id: string;
      apiToken: string;
    };
    console.log(
      `[sip-provisioning] Agent created: ${agent.id} (token: ${agent.apiToken})`
    );

    // Crée les 12 ToolConfigs
    for (const toolDef of ALLORESTO_TOOL_DEFINITIONS) {
      const toolResp = await sipFetch(`/agents/${agent.id}/tools`, {
        method: "POST",
        body: JSON.stringify({
          name: toolDef.name,
          description: toolDef.description,
          parameters: toolDef.parameters,
          http: toolDef.http,
          contextUpdates: toolDef.contextUpdates || null,
          condition: toolDef.condition || null,
          extraCostResponseField: toolDef.extraCostResponseField || null,
          triggersHangup: toolDef.triggersHangup || false,
          triggersTransfer: toolDef.triggersTransfer || false,
          mutesClientAudio: toolDef.mutesClientAudio || false,
          skipResponseCreate: toolDef.skipResponseCreate || false,
          isEnabled: true,
          sortOrder: toolDef.sortOrder,
        }),
      });

      if (!toolResp.ok) {
        console.error(
          `[sip-provisioning] Tool ${toolDef.name} creation failed: ${toolResp.status}`
        );
      }
    }

    console.log(
      `[sip-provisioning] ${ALLORESTO_TOOL_DEFINITIONS.length} tools created for agent ${agent.id}`
    );
    return { agentId: agent.id, finalCustomerId };
  } catch (err) {
    console.error("[sip-provisioning] Provisioning failed:", err);
    return { agentId: null, finalCustomerId: null };
  }
}

// ─── Brain Config Generator ──────────────────────────────────────────────────
// Genere le brain JSON pour AlloResto, pret a pusher via PUT /api/agents/:id/brain

const BRAIN_VERSION = "1.0.0";

export function buildBrainConfig() {
  return {
    prompt: "={{data.systemPrompt}}",
    tools: ALLORESTO_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      http: t.http,
      contextUpdates: t.contextUpdates || null,
      condition: t.condition || null,
      extraCostResponseField: t.extraCostResponseField || null,
      triggersHangup: t.triggersHangup || false,
      triggersTransfer: t.triggersTransfer || false,
      mutesClientAudio: t.mutesClientAudio || false,
      skipResponseCreate: t.skipResponseCreate || false,
      sortOrder: t.sortOrder,
    })),
    version: BRAIN_VERSION,
  };
}

/**
 * Push le brain vers un agent existant.
 * Utiliser apres un deploiement pour mettre a jour le prompt/tools.
 */
export async function pushBrain(agentId: string): Promise<boolean> {
  try {
    const brain = buildBrainConfig();
    const resp = await sipFetch(`/agents/${agentId}/brain`, {
      method: "PUT",
      body: JSON.stringify(brain),
    });
    if (!resp.ok) {
      console.error(`[sip-provisioning] Brain push failed for ${agentId}: ${resp.status}`);
      return false;
    }
    console.log(`[sip-provisioning] Brain v${BRAIN_VERSION} pushed to agent ${agentId}`);
    return true;
  } catch (err) {
    console.error(`[sip-provisioning] Brain push failed for ${agentId}:`, err);
    return false;
  }
}

/**
 * Push le brain vers TOUS les agents AlloResto.
 * Appeler apres un deploiement qui change le prompt ou les tools.
 */
export async function pushBrainToAll(): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  try {
    const accountId = await ensureAccount();
    const resp = await sipFetch(`/agents?accountId=${accountId}`);
    if (!resp.ok) return { success, failed };
    const agents = (await resp.json()) as { id: string; name: string }[];
    for (const agent of agents) {
      // Push brain (prompt + tools)
      const ok = await pushBrain(agent.id);
      if (ok) success++;
      else failed++;

      // MAJ URLs avec convention =
      await updateAgent(agent.id, {
        apiBaseUrl: ALLORESTO_URL,
        externalSessionUrl: `=${ALLORESTO_URL}/api/ai?restaurantId={{config.restaurantId}}&callerPhone={{callerPhone}}`,
        onCallEndWebhook: `={{BASE_URL}}/api/calls`,
      });
    }
    console.log(`[sip-provisioning] Brain push complete: ${success} OK, ${failed} failed`);
  } catch (err) {
    console.error("[sip-provisioning] Brain push to all failed:", err);
  }
  return { success, failed };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAgent(
  agentId: string,
  updates: {
    name?: string;
    aiVoice?: string;
    timezone?: string;
    sipDomain?: string;
    sipUsername?: string;
    sipPassword?: string;
    isActive?: boolean;
    apiBaseUrl?: string;
    externalSessionUrl?: string;
    onCallEndWebhook?: string;
    config?: Record<string, any>;
  }
): Promise<void> {
  try {
    const resp = await sipFetch(`/agents/${agentId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    if (!resp.ok) {
      console.error(
        `[sip-provisioning] Agent update failed: ${resp.status}`
      );
    }
  } catch (err) {
    console.error("[sip-provisioning] Agent update failed:", err);
  }
}
