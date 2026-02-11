/**
 * service-manager.ts — Gestionnaire de services vocaux AlloResto
 *
 * Remplace test.sh : démarre/arrête/surveille app.ts + sipbridge par restaurant.
 * Récupère la config (credentials SIP, mode) depuis l'API Next.js.
 *
 * Usage :
 *     npx tsx service-manager.ts
 *
 * Variables d'environnement :
 *     OPENAI_API_KEY          — clé OpenAI (obligatoire)
 *     NEXT_API_URL            — URL de l'API Next.js (défaut: http://localhost:3000)
 *     SERVICE_MANAGER_PORT    — port de l'API admin (défaut: 8080)
 *     APP_BASE_PORT           — port de base pour app.ts (défaut: 5050)
 *     BRIDGE_BASE_PORT        — port de base pour sipbridge (défaut: 5060)
 */

import "dotenv/config";
import { spawn, ChildProcess } from "child_process";
import { openSync } from "fs";
import { mkdir } from "fs/promises";
import http from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";

// ── Config ────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const NEXT_API_URL = process.env.NEXT_API_URL || "http://localhost:3000";
const SERVICE_MANAGER_PORT = parseInt(process.env.SERVICE_MANAGER_PORT || "8080", 10);
const APP_BASE_PORT = parseInt(process.env.APP_BASE_PORT || "5050", 10);
const BRIDGE_BASE_PORT = parseInt(process.env.BRIDGE_BASE_PORT || "5060", 10);
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL || "30", 10);
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || "300", 10);
const MAX_CALL_DURATION = parseInt(process.env.MAX_CALL_DURATION || "600", 10);
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_WINDOW_S = 300;

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const IS_DEV = process.env.NODE_ENV === "development";
const LOG_LEVEL = IS_DEV ? "debug" : "info";

// Python : venv ou système
import { existsSync } from "fs";
const PYTHON = existsSync(path.join(SCRIPT_DIR, "venv", "bin", "python"))
  ? path.join(SCRIPT_DIR, "venv", "bin", "python")
  : "python";

// ── Types ─────────────────────────────────────────────────────

type AgentState =
  | "stopped"
  | "starting"
  | "running"
  | "unhealthy"
  | "failed"
  | "stopping";

interface AgentPorts {
  app: number;
  bridge: number | null;
}

interface RestaurantConfig {
  restaurantId: string;
  restaurantName: string;
  sipBridge: boolean;
  sipDomain: string | null;
  sipUsername: string | null;
  sipPassword: string | null;
  maxParallelCalls: number;
}

// ── Helpers ───────────────────────────────────────────────────

function sleep(seconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

/**
 * HTTP GET via node:http — contourne le blocage de fetch/undici sur les
 * ports "interdits" (5060 = SIP est dans la liste spec WHATWG).
 */
function httpGet(
  url: string,
  timeoutMs = 3000,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`${ts} [INFO] service-manager — ${msg}`);
}

function logWarn(msg: string): void {
  const ts = new Date().toISOString();
  console.warn(`${ts} [WARN] service-manager — ${msg}`);
}

function logError(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`${ts} [ERROR] service-manager — ${msg}`);
}

// ── Port Pool ─────────────────────────────────────────────────

class PortPool {
  private appBase: number;
  private bridgeBase: number;
  private allocated = new Map<string, AgentPorts>();

  constructor(appBase: number, bridgeBase: number) {
    this.appBase = appBase;
    this.bridgeBase = bridgeBase;
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "0.0.0.0");
    });
  }

  private async nextFree(base: number, exclude: Set<number>): Promise<number> {
    for (let port = base; port < base + 100; port++) {
      if (!exclude.has(port) && (await this.isPortFree(port))) {
        return port;
      }
    }
    throw new Error(`Aucun port libre à partir de ${base}`);
  }

  async allocate(
    restaurantId: string,
    needBridge: boolean,
  ): Promise<AgentPorts> {
    const existing = this.allocated.get(restaurantId);
    if (existing) return existing;

    const usedApp = new Set<number>();
    const usedBridge = new Set<number>();
    for (const p of this.allocated.values()) {
      usedApp.add(p.app);
      if (p.bridge != null) usedBridge.add(p.bridge);
    }

    const appPort = await this.nextFree(this.appBase, usedApp);
    const bridgePort = needBridge
      ? await this.nextFree(this.bridgeBase, usedBridge)
      : null;

    const ports: AgentPorts = { app: appPort, bridge: bridgePort };
    this.allocated.set(restaurantId, ports);
    return ports;
  }

  release(restaurantId: string): void {
    this.allocated.delete(restaurantId);
  }

  get(restaurantId: string): AgentPorts | undefined {
    return this.allocated.get(restaurantId);
  }
}

// ── Restaurant Agent ──────────────────────────────────────────

class RestaurantAgent {
  config: RestaurantConfig;
  ports: AgentPorts;
  state: AgentState = "stopped";
  appProcess: ChildProcess | null = null;
  bridgeProcess: ChildProcess | null = null;
  startTime: Date | null = null;
  restartCount = 0;
  lastRestartTime: Date | null = null;
  lastHealthCheck: Date | null = null;
  activeCalls = 0;

  constructor(config: RestaurantConfig, ports: AgentPorts) {
    this.config = config;
    this.ports = ports;
  }

  private isProcessAlive(proc: ChildProcess | null): boolean {
    if (!proc) return false;
    return proc.exitCode === null && proc.signalCode === null;
  }

  async start(): Promise<void> {
    if (this.state === "running") return;

    this.state = "starting";
    const rid = this.config.restaurantId;
    const name = this.config.restaurantName;

    try {
      // Create log directory
      const logDir = path.join(SCRIPT_DIR, "logs");
      await mkdir(logDir, { recursive: true });

      // 1. Start app.ts
      const appLogFd = openSync(
        path.join(logDir, `${rid}-app.log`),
        "a",
      );
      const appEnv: Record<string, string> = {
        ...process.env as Record<string, string>,
        PORT: String(this.ports.app),
        RESTAURANT_ID: rid,
        OPENAI_API_KEY: OPENAI_API_KEY,
        NEXT_API_URL: NEXT_API_URL,
        MAX_CALL_DURATION: String(MAX_CALL_DURATION),
        BRIDGE_PORT: this.ports.bridge ? String(this.ports.bridge) : "",
      };

      const appCmd = IS_DEV
        ? { bin: "npx", args: ["tsx", path.join(SCRIPT_DIR, "app.ts")] }
        : { bin: "node", args: [path.join(SCRIPT_DIR, "dist", "app.js")] };

      this.appProcess = spawn(appCmd.bin, appCmd.args, {
        env: appEnv,
        cwd: SCRIPT_DIR,
        stdio: ["ignore", appLogFd, appLogFd],
        detached: true,
      });
      this.appProcess.unref();

      log(`[${name}] app.ts démarré (PID=${this.appProcess.pid}, port=${this.ports.app})`);

      // Wait for app.ts to be ready
      await this.waitForHttp(`http://127.0.0.1:${this.ports.app}/`, 15);

      // 2. Start sipbridge (if SIP mode)
      if (this.config.sipBridge && this.ports.bridge) {
        if (!this.config.sipUsername || !this.config.sipDomain) {
          logWarn(
            `[${name}] sipBridge=true mais credentials SIP manquants, skip bridge`,
          );
        } else {
          const bridgeCmd = [
            PYTHON,
            path.join(SCRIPT_DIR, "main-sipbridge.py"),
            "--sip-domain",
            this.config.sipDomain,
            "--sip-username",
            this.config.sipUsername,
            "--ws-target",
            `ws://localhost:${this.ports.app}/media-stream`,
            "--api-port",
            String(this.ports.bridge),
            "--max-call-duration",
            String(MAX_CALL_DURATION),
            "--max-concurrent-calls",
            String(this.config.maxParallelCalls),
            "--param",
            `restaurantId=${rid}`,
          ];
          if (this.config.sipPassword) {
            bridgeCmd.push("--sip-password", this.config.sipPassword);
          }

          const bridgeLogFd = openSync(
            path.join(logDir, `${rid}-bridge.log`),
            "a",
          );
          const bridgeEnv: Record<string, string> = {
            ...process.env as Record<string, string>,
            PYTHONUNBUFFERED: "1",
          };

          this.bridgeProcess = spawn(bridgeCmd[0], bridgeCmd.slice(1), {
            cwd: SCRIPT_DIR,
            env: bridgeEnv,
            stdio: ["ignore", bridgeLogFd, bridgeLogFd],
            detached: true,
          });
          this.bridgeProcess.unref();

          log(
            `[${name}] sipbridge démarré (PID=${this.bridgeProcess.pid}, port=${this.ports.bridge})`,
          );

          await this.waitForHttp(
            `http://127.0.0.1:${this.ports.bridge}/health`,
            30,
          );
        }
      }

      this.state = "running";
      this.startTime = new Date();
      log(`[${name}] Agent opérationnel`);
    } catch (e) {
      logError(`[${name}] Échec démarrage : ${e}`);
      await this.stop();
      this.state = "failed";
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.state = "stopping";
    const name = this.config.restaurantName;

    // Stop bridge first (depends on app.ts)
    if (this.bridgeProcess && this.isProcessAlive(this.bridgeProcess)) {
      this.bridgeProcess.kill("SIGTERM");
      await this.waitForProcessExit(this.bridgeProcess, 5);
      log(`[${name}] sipbridge arrêté`);
    }
    this.bridgeProcess = null;

    // Stop app.ts
    if (this.appProcess && this.isProcessAlive(this.appProcess)) {
      this.appProcess.kill("SIGTERM");
      await this.waitForProcessExit(this.appProcess, 5);
      log(`[${name}] app.ts arrêté`);
    }
    this.appProcess = null;

    this.state = "stopped";
    this.activeCalls = 0;
  }

  async restart(): Promise<void> {
    await this.stop();
    await sleep(2);
    await this.start();
    this.restartCount++;
    this.lastRestartTime = new Date();
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check process alive
      if (this.appProcess && !this.isProcessAlive(this.appProcess)) {
        logWarn(
          `[${this.config.restaurantName}] app.ts a crashé (exit=${this.appProcess.exitCode})`,
        );
        return false;
      }

      if (this.bridgeProcess && !this.isProcessAlive(this.bridgeProcess)) {
        logWarn(
          `[${this.config.restaurantName}] sipbridge a crashé (exit=${this.bridgeProcess.exitCode})`,
        );
        return false;
      }

      // HTTP health checks (via http.get — fetch bloque port 5060)
      const appResp = await httpGet(`http://127.0.0.1:${this.ports.app}/`);
      if (appResp.status >= 500 || appResp.status === 0) return false;

      if (this.bridgeProcess && this.ports.bridge) {
        const bridgeResp = await httpGet(
          `http://127.0.0.1:${this.ports.bridge}/health`,
        );
        if (bridgeResp.status >= 500 || bridgeResp.status === 0) return false;
        try {
          const data = JSON.parse(bridgeResp.body);
          this.activeCalls = data.active_calls || 0;
        } catch {}
      }

      this.lastHealthCheck = new Date();
      return true;
    } catch (e) {
      return false;
    }
  }

  private async waitForHttp(url: string, timeoutSec: number): Promise<void> {
    const deadline = Date.now() + timeoutSec * 1000;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt++;
      try {
        const resp = await httpGet(url, 2000);
        if (resp.status > 0 && resp.status < 500) {
          log(`waitForHttp OK: ${url} (status=${resp.status}, attempt=${attempt})`);
          return;
        }
      } catch {
        // retry
      }
      await sleep(0.5);
    }
    throw new Error(`${url} non joignable après ${timeoutSec}s`);
  }

  private waitForProcessExit(
    proc: ChildProcess,
    timeoutSec: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, timeoutSec * 1000);

      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      // Already exited
      if (proc.exitCode !== null || proc.signalCode !== null) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  toDict(): Record<string, any> {
    const now = new Date();
    const uptime =
      this.startTime && this.state === "running"
        ? Math.round((now.getTime() - this.startTime.getTime()) / 1000)
        : 0;

    return {
      restaurantId: this.config.restaurantId,
      restaurantName: this.config.restaurantName,
      state: this.state,
      sipBridge: this.config.sipBridge,
      ports: {
        app: this.ports.app,
        bridge: this.ports.bridge,
      },
      pids: {
        app:
          this.appProcess && this.isProcessAlive(this.appProcess)
            ? this.appProcess.pid
            : null,
        bridge:
          this.bridgeProcess && this.isProcessAlive(this.bridgeProcess)
            ? this.bridgeProcess.pid
            : null,
      },
      activeCalls: this.activeCalls,
      uptimeSeconds: uptime,
      restartCount: this.restartCount,
      lastHealthCheck: this.lastHealthCheck?.toISOString() ?? null,
    };
  }
}

// ── Service Manager ───────────────────────────────────────────

class ServiceManager {
  agents = new Map<string, RestaurantAgent>();
  portPool = new PortPool(APP_BASE_PORT, BRIDGE_BASE_PORT);
  startTime = new Date();
  private running = true;

  async fetchRestaurants(): Promise<Record<string, any>[]> {
    const resp = await fetch(`${NEXT_API_URL}/api/sip/agents`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`fetchRestaurants: ${resp.status}`);
    return resp.json() as Promise<Record<string, any>[]>;
  }

  async refresh(): Promise<void> {
    log("Rafraîchissement de la liste des restaurants...");

    let restaurants: Record<string, any>[];
    try {
      restaurants = await this.fetchRestaurants();
    } catch (e) {
      logError(`Impossible de récupérer la liste : ${e}`);
      return;
    }

    const newIds = new Set(restaurants.map((r) => r.restaurantId as string));
    const currentIds = new Set(this.agents.keys());

    // Stop removed
    for (const rid of currentIds) {
      if (!newIds.has(rid)) {
        log(`Restaurant retiré : ${rid}`);
        const agent = this.agents.get(rid)!;
        await agent.stop();
        this.portPool.release(rid);
        this.agents.delete(rid);
      }
    }

    // Start new
    for (const r of restaurants) {
      const rid: string = r.restaurantId;
      if (currentIds.has(rid)) continue;

      const config: RestaurantConfig = {
        restaurantId: rid,
        restaurantName: r.restaurantName,
        sipBridge: r.sipBridge || false,
        sipDomain: r.sipDomain || null,
        sipUsername: r.sipUsername || null,
        sipPassword: r.sipPassword || null,
        maxParallelCalls: r.maxParallelCalls || 10,
      };

      const ports = await this.portPool.allocate(rid, config.sipBridge);
      const agent = new RestaurantAgent(config, ports);

      try {
        await agent.start();
      } catch (e) {
        logError(`Échec démarrage ${config.restaurantName} : ${e}`);
      }

      this.agents.set(rid, agent);
    }

    log(`Rafraîchissement terminé : ${this.agents.size} agent(s)`);
  }

  async healthLoop(): Promise<void> {
    while (this.running) {
      await sleep(HEALTH_CHECK_INTERVAL);

      for (const agent of this.agents.values()) {
        if (agent.state !== "running" && agent.state !== "unhealthy") {
          continue;
        }

        const healthy = await agent.healthCheck();

        if (!healthy) {
          if (agent.state === "running") {
            logWarn(`[${agent.config.restaurantName}] Unhealthy`);
            agent.state = "unhealthy";
          }

          // Auto-restart policy
          if (this.shouldRestart(agent)) {
            try {
              log(`[${agent.config.restaurantName}] Tentative de restart...`);
              await agent.restart();
            } catch (e) {
              logError(
                `[${agent.config.restaurantName}] Restart échoué : ${e}`,
              );
              agent.state = "failed";
            }
          } else {
            agent.state = "failed";
          }
        } else if (agent.state === "unhealthy") {
          agent.state = "running";
        }
      }
    }
  }

  async refreshLoop(): Promise<void> {
    while (this.running) {
      await sleep(REFRESH_INTERVAL);
      await this.refresh();
    }
  }

  private shouldRestart(agent: RestaurantAgent): boolean {
    if (agent.restartCount >= MAX_RESTART_ATTEMPTS) {
      if (agent.lastRestartTime) {
        const elapsed =
          (Date.now() - agent.lastRestartTime.getTime()) / 1000;
        if (elapsed < RESTART_WINDOW_S) {
          return false;
        }
        agent.restartCount = 0;
      }
    }
    return true;
  }

  async stopAll(): Promise<void> {
    this.running = false;
    log("Arrêt de tous les agents...");
    for (const agent of this.agents.values()) {
      try {
        await agent.stop();
      } catch (e) {
        logError(`Erreur arrêt ${agent.config.restaurantName} : ${e}`);
      }
    }
  }
}

// ── Fastify Admin API ─────────────────────────────────────────

const server = Fastify({ logger: false });
await server.register(fastifyCors);

const manager = new ServiceManager();

server.get("/health", async () => {
  let running = 0;
  let totalCalls = 0;
  for (const a of manager.agents.values()) {
    if (a.state === "running") running++;
    totalCalls += a.activeCalls;
  }
  const uptime = Math.round(
    (Date.now() - manager.startTime.getTime()) / 1000,
  );
  return {
    status: "ok",
    activeAgents: running,
    totalAgents: manager.agents.size,
    totalActiveCalls: totalCalls,
    uptimeSeconds: uptime,
  };
});

server.get("/agents", async () => {
  return Array.from(manager.agents.values()).map((a) => a.toDict());
});

server.get<{ Params: { restaurantId: string } }>(
  "/agents/:restaurantId/status",
  async (request, reply) => {
    const agent = manager.agents.get(request.params.restaurantId);
    if (!agent) {
      return reply.code(404).send({ error: "Agent non trouvé" });
    }
    await agent.healthCheck();
    return agent.toDict();
  },
);

server.post<{ Params: { restaurantId: string } }>(
  "/agents/:restaurantId/start",
  async (request, reply) => {
    const agent = manager.agents.get(request.params.restaurantId);
    if (!agent) {
      return reply.code(404).send({ error: "Agent non trouvé" });
    }
    if (agent.state === "running") {
      return reply
        .code(400)
        .send({ error: "Agent déjà en cours d'exécution" });
    }
    try {
      await agent.start();
      return { status: "started", restaurantId: request.params.restaurantId };
    } catch (e) {
      return reply.code(500).send({ error: `Échec démarrage : ${e}` });
    }
  },
);

server.post<{ Params: { restaurantId: string } }>(
  "/agents/:restaurantId/stop",
  async (request, reply) => {
    const agent = manager.agents.get(request.params.restaurantId);
    if (!agent) {
      return reply.code(404).send({ error: "Agent non trouvé" });
    }
    await agent.stop();
    return { status: "stopped", restaurantId: request.params.restaurantId };
  },
);

server.post<{ Params: { restaurantId: string } }>(
  "/agents/:restaurantId/restart",
  async (request, reply) => {
    const agent = manager.agents.get(request.params.restaurantId);
    if (!agent) {
      return reply.code(404).send({ error: "Agent non trouvé" });
    }
    try {
      await agent.restart();
      return {
        status: "restarted",
        restaurantId: request.params.restaurantId,
      };
    } catch (e) {
      return reply.code(500).send({ error: `Échec restart : ${e}` });
    }
  },
);

server.post("/refresh", async () => {
  await manager.refresh();
  return { status: "refreshed", count: manager.agents.size };
});

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!OPENAI_API_KEY) {
    logError("OPENAI_API_KEY requis");
    process.exit(1);
  }

  log(`Service Manager démarrage (port=${SERVICE_MANAGER_PORT})`);
  log(`  MODE = ${IS_DEV ? "development (tsx)" : "production (node)"}`);
  log(`  LOG_LEVEL = ${LOG_LEVEL}`);
  log(`  NEXT_API_URL = ${NEXT_API_URL}`);
  log(`  APP_BASE_PORT = ${APP_BASE_PORT}`);
  log(`  BRIDGE_BASE_PORT = ${BRIDGE_BASE_PORT}`);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("Signal reçu, arrêt en cours...");
    await manager.stopAll();
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => process.exit(0), 10_000).unref();
    await server.close();
    log("Service Manager arrêté");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Admin API — start FIRST so the admin page works immediately
  log(`Démarrage API admin sur 0.0.0.0:${SERVICE_MANAGER_PORT}`);
  await server.listen({ port: SERVICE_MANAGER_PORT, host: "0.0.0.0" });

  // Initial discovery in background (don't block server startup)
  setTimeout(async () => {
    try {
      await manager.refresh();
    } catch (e) {
      logError(`Erreur lors du refresh initial : ${e}`);
    }
  }, 1000);

  // Background tasks
  manager.healthLoop().catch((e) =>
    logError(`healthLoop erreur: ${e}`),
  );
  manager.refreshLoop().catch((e) =>
    logError(`refreshLoop erreur: ${e}`),
  );
}

main();
