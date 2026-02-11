#!/usr/bin/env python3
"""
service_manager.py — Gestionnaire de services vocaux AlloResto

Remplace test.sh : démarre/arrête/surveille app.py + sipbridge par restaurant.
Récupère la config (credentials SIP, mode) depuis l'API Next.js.

Usage :
    python service_manager.py

Variables d'environnement :
    OPENAI_API_KEY          — clé OpenAI (obligatoire)
    NEXT_API_URL            — URL de l'API Next.js (défaut: http://localhost:3000)
    SERVICE_MANAGER_PORT    — port de l'API admin (défaut: 8080)
    APP_BASE_PORT           — port de base pour app.py (défaut: 5050)
    BRIDGE_BASE_PORT        — port de base pour sipbridge (défaut: 5060)
"""

import asyncio
import logging
import os
import signal
import socket
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("service-manager")

# ── Config ────────────────────────────────────────────────────

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
NEXT_API_URL = os.getenv("NEXT_API_URL", "http://localhost:3000")
SERVICE_MANAGER_PORT = int(os.getenv("SERVICE_MANAGER_PORT", "8080"))
APP_BASE_PORT = int(os.getenv("APP_BASE_PORT", "5050"))
BRIDGE_BASE_PORT = int(os.getenv("BRIDGE_BASE_PORT", "5060"))
HEALTH_CHECK_INTERVAL = int(os.getenv("HEALTH_CHECK_INTERVAL", "30"))
REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "300"))
MAX_CALL_DURATION = int(os.getenv("MAX_CALL_DURATION", "600"))
MAX_RESTART_ATTEMPTS = 3
RESTART_WINDOW_S = 300
SCRIPT_DIR = Path(__file__).parent

# Python : venv ou système
PYTHON = str(SCRIPT_DIR / "venv" / "bin" / "python") if (SCRIPT_DIR / "venv" / "bin" / "python").exists() else sys.executable


# ── Types ─────────────────────────────────────────────────────

class AgentState(str, Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    UNHEALTHY = "unhealthy"
    FAILED = "failed"
    STOPPING = "stopping"


@dataclass
class AgentPorts:
    app: int
    bridge: int | None = None


@dataclass
class RestaurantConfig:
    restaurant_id: str
    restaurant_name: str
    sip_bridge: bool
    sip_domain: str | None = None
    sip_username: str | None = None
    sip_password: str | None = None
    max_parallel_calls: int = 10


# ── Port Pool ─────────────────────────────────────────────────

class PortPool:
    """Gère l'allocation dynamique des ports."""

    def __init__(self, app_base: int, bridge_base: int):
        self.app_base = app_base
        self.bridge_base = bridge_base
        self._allocated: dict[str, AgentPorts] = {}

    def _is_port_free(self, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("0.0.0.0", port))
                return True
        except OSError:
            return False

    def _next_free(self, base: int, exclude: set[int]) -> int:
        port = base
        while port < base + 100:
            if port not in exclude and self._is_port_free(port):
                return port
            port += 1
        raise RuntimeError(f"Aucun port libre à partir de {base}")

    def allocate(self, restaurant_id: str, need_bridge: bool) -> AgentPorts:
        if restaurant_id in self._allocated:
            return self._allocated[restaurant_id]

        used_app = {p.app for p in self._allocated.values()}
        used_bridge = {p.bridge for p in self._allocated.values() if p.bridge}

        app_port = self._next_free(self.app_base, used_app)
        bridge_port = self._next_free(self.bridge_base, used_bridge) if need_bridge else None

        ports = AgentPorts(app=app_port, bridge=bridge_port)
        self._allocated[restaurant_id] = ports
        return ports

    def release(self, restaurant_id: str) -> None:
        self._allocated.pop(restaurant_id, None)

    def get(self, restaurant_id: str) -> AgentPorts | None:
        return self._allocated.get(restaurant_id)


# ── Restaurant Agent ──────────────────────────────────────────

class RestaurantAgent:
    """Gère les processus app.py + sipbridge pour un restaurant."""

    def __init__(self, config: RestaurantConfig, ports: AgentPorts):
        self.config = config
        self.ports = ports
        self.state = AgentState.STOPPED
        self.app_process: subprocess.Popen | None = None
        self.bridge_process: subprocess.Popen | None = None
        self.start_time: datetime | None = None
        self.restart_count = 0
        self.last_restart_time: datetime | None = None
        self.last_health_check: datetime | None = None
        self.active_calls = 0

    async def start(self) -> None:
        if self.state == AgentState.RUNNING:
            return

        self.state = AgentState.STARTING
        rid = self.config.restaurant_id
        name = self.config.restaurant_name

        try:
            # 1. Start app.py
            app_env = {
                **os.environ,
                "PORT": str(self.ports.app),
                "RESTAURANT_ID": rid,
                "OPENAI_API_KEY": OPENAI_API_KEY,
                "NEXT_API_URL": NEXT_API_URL,
                "MAX_CALL_DURATION": str(MAX_CALL_DURATION),
                "BRIDGE_PORT": str(self.ports.bridge) if self.ports.bridge else "",
            }
            log_dir = SCRIPT_DIR / "logs"
            log_dir.mkdir(exist_ok=True)
            app_log = open(log_dir / f"{rid}-app.log", "a")
            app_env["PYTHONUNBUFFERED"] = "1"
            self.app_process = subprocess.Popen(
                [PYTHON, "-u", str(SCRIPT_DIR / "app.py")],
                env=app_env,
                cwd=str(SCRIPT_DIR),
                stdout=app_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            logger.info(f"[{name}] app.py démarré (PID={self.app_process.pid}, port={self.ports.app})")

            # Wait for app.py to be ready
            await self._wait_for_http(f"http://localhost:{self.ports.app}/", timeout=15)

            # 2. Start sipbridge (if SIP mode)
            if self.config.sip_bridge and self.ports.bridge:
                if not (self.config.sip_username and self.config.sip_domain):
                    logger.warning(f"[{name}] sipBridge=true mais credentials SIP manquants, skip bridge")
                else:
                    bridge_cmd = [
                        PYTHON, str(SCRIPT_DIR / "main-sipbridge.py"),
                        "--sip-domain", self.config.sip_domain,
                        "--sip-username", self.config.sip_username,
                        "--ws-target", f"ws://localhost:{self.ports.app}/media-stream",
                        "--api-port", str(self.ports.bridge),
                        "--max-call-duration", str(MAX_CALL_DURATION),
                        "--max-concurrent-calls", str(self.config.max_parallel_calls),
                        "--param", f"restaurantId={rid}",
                    ]
                    if self.config.sip_password:
                        bridge_cmd += ["--sip-password", self.config.sip_password]

                    bridge_log = open(log_dir / f"{rid}-bridge.log", "a")
                    bridge_env = {**os.environ, "PYTHONUNBUFFERED": "1"}
                    self.bridge_process = subprocess.Popen(
                        bridge_cmd,
                        cwd=str(SCRIPT_DIR),
                        env=bridge_env,
                        stdout=bridge_log,
                        stderr=subprocess.STDOUT,
                        start_new_session=True,
                    )
                    logger.info(f"[{name}] sipbridge démarré (PID={self.bridge_process.pid}, port={self.ports.bridge})")

                    await self._wait_for_http(
                        f"http://localhost:{self.ports.bridge}/health",
                        timeout=30,
                    )

            self.state = AgentState.RUNNING
            self.start_time = datetime.now(timezone.utc)
            logger.info(f"[{name}] Agent opérationnel")

        except Exception as e:
            logger.error(f"[{name}] Échec démarrage : {e}")
            await self.stop()
            self.state = AgentState.FAILED
            raise

    async def stop(self) -> None:
        self.state = AgentState.STOPPING
        name = self.config.restaurant_name

        # Stop bridge first (depends on app.py)
        if self.bridge_process and self.bridge_process.poll() is None:
            self.bridge_process.terminate()
            try:
                await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(None, self.bridge_process.wait),
                    timeout=5,
                )
            except asyncio.TimeoutError:
                self.bridge_process.kill()
                self.bridge_process.wait()
            logger.info(f"[{name}] sipbridge arrêté")
        self.bridge_process = None

        # Stop app.py
        if self.app_process and self.app_process.poll() is None:
            self.app_process.terminate()
            try:
                await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(None, self.app_process.wait),
                    timeout=5,
                )
            except asyncio.TimeoutError:
                self.app_process.kill()
                self.app_process.wait()
            logger.info(f"[{name}] app.py arrêté")
        self.app_process = None

        self.state = AgentState.STOPPED
        self.active_calls = 0

    async def restart(self) -> None:
        await self.stop()
        await asyncio.sleep(2)
        await self.start()
        self.restart_count += 1
        self.last_restart_time = datetime.now(timezone.utc)

    async def health_check(self) -> bool:
        """Vérifie que les processus sont vivants et répondent."""
        try:
            # Check process alive
            if self.app_process and self.app_process.poll() is not None:
                logger.warning(f"[{self.config.restaurant_name}] app.py a crashé (exit={self.app_process.returncode})")
                return False

            if self.bridge_process and self.bridge_process.poll() is not None:
                logger.warning(f"[{self.config.restaurant_name}] sipbridge a crashé (exit={self.bridge_process.returncode})")
                return False

            # HTTP health checks
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.get(f"http://localhost:{self.ports.app}/") as resp:
                    if resp.status != 200:
                        return False

                if self.bridge_process and self.ports.bridge:
                    async with session.get(f"http://localhost:{self.ports.bridge}/health") as resp:
                        if resp.status != 200:
                            return False
                        data = await resp.json()
                        self.active_calls = data.get("active_calls", 0)

            self.last_health_check = datetime.now(timezone.utc)
            return True

        except Exception as e:
            logger.debug(f"[{self.config.restaurant_name}] health check failed: {e}")
            return False

    async def _wait_for_http(self, url: str, timeout: float = 10) -> None:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as session:
                    async with session.get(url) as resp:
                        if resp.status < 500:
                            return
            except Exception:
                pass
            await asyncio.sleep(0.5)
        raise TimeoutError(f"{url} non joignable après {timeout}s")

    def to_dict(self) -> dict:
        now = datetime.now(timezone.utc)
        uptime = (now - self.start_time).total_seconds() if self.start_time and self.state == AgentState.RUNNING else 0

        return {
            "restaurantId": self.config.restaurant_id,
            "restaurantName": self.config.restaurant_name,
            "state": self.state.value,
            "sipBridge": self.config.sip_bridge,
            "ports": {
                "app": self.ports.app,
                "bridge": self.ports.bridge,
            },
            "pids": {
                "app": self.app_process.pid if self.app_process and self.app_process.poll() is None else None,
                "bridge": self.bridge_process.pid if self.bridge_process and self.bridge_process.poll() is None else None,
            },
            "activeCalls": self.active_calls,
            "uptimeSeconds": round(uptime),
            "restartCount": self.restart_count,
            "lastHealthCheck": self.last_health_check.isoformat() if self.last_health_check else None,
        }


# ── Service Manager ───────────────────────────────────────────

class ServiceManager:
    def __init__(self):
        self.agents: dict[str, RestaurantAgent] = {}
        self.port_pool = PortPool(APP_BASE_PORT, BRIDGE_BASE_PORT)
        self.start_time = datetime.now(timezone.utc)
        self._running = True

    async def fetch_restaurants(self) -> list[dict]:
        url = f"{NEXT_API_URL}/api/sip/agents"
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                return await resp.json()

    async def refresh(self) -> None:
        """Synchronise les agents avec la liste en BDD."""
        logger.info("Rafraîchissement de la liste des restaurants...")

        try:
            restaurants = await self.fetch_restaurants()
        except Exception as e:
            logger.error(f"Impossible de récupérer la liste : {e}")
            return

        new_ids = {r["restaurantId"] for r in restaurants}
        current_ids = set(self.agents.keys())

        # Stop removed
        for rid in current_ids - new_ids:
            logger.info(f"Restaurant retiré : {rid}")
            agent = self.agents[rid]
            await agent.stop()
            self.port_pool.release(rid)
            del self.agents[rid]

        # Start new
        for r in restaurants:
            rid = r["restaurantId"]
            if rid in current_ids:
                continue

            config = RestaurantConfig(
                restaurant_id=rid,
                restaurant_name=r["restaurantName"],
                sip_bridge=r.get("sipBridge", False),
                sip_domain=r.get("sipDomain"),
                sip_username=r.get("sipUsername"),
                sip_password=r.get("sipPassword"),
                max_parallel_calls=r.get("maxParallelCalls", 10),
            )

            ports = self.port_pool.allocate(rid, config.sip_bridge)
            agent = RestaurantAgent(config, ports)

            try:
                await agent.start()
            except Exception as e:
                logger.error(f"Échec démarrage {config.restaurant_name} : {e}")

            self.agents[rid] = agent

        logger.info(f"Rafraîchissement terminé : {len(self.agents)} agent(s)")

    async def health_loop(self) -> None:
        while self._running:
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)

            for agent in list(self.agents.values()):
                if agent.state not in (AgentState.RUNNING, AgentState.UNHEALTHY):
                    continue

                healthy = await agent.health_check()

                if not healthy:
                    if agent.state == AgentState.RUNNING:
                        logger.warning(f"[{agent.config.restaurant_name}] Unhealthy")
                        agent.state = AgentState.UNHEALTHY

                    # Auto-restart policy
                    if self._should_restart(agent):
                        try:
                            logger.info(f"[{agent.config.restaurant_name}] Tentative de restart...")
                            await agent.restart()
                        except Exception as e:
                            logger.error(f"[{agent.config.restaurant_name}] Restart échoué : {e}")
                            agent.state = AgentState.FAILED
                    else:
                        agent.state = AgentState.FAILED

                elif agent.state == AgentState.UNHEALTHY:
                    agent.state = AgentState.RUNNING

    async def refresh_loop(self) -> None:
        while self._running:
            await asyncio.sleep(REFRESH_INTERVAL)
            await self.refresh()

    def _should_restart(self, agent: RestaurantAgent) -> bool:
        if agent.restart_count >= MAX_RESTART_ATTEMPTS:
            if agent.last_restart_time:
                elapsed = (datetime.now(timezone.utc) - agent.last_restart_time).total_seconds()
                if elapsed < RESTART_WINDOW_S:
                    return False
                agent.restart_count = 0
        return True

    async def stop_all(self) -> None:
        self._running = False
        logger.info("Arrêt de tous les agents...")
        for agent in self.agents.values():
            try:
                await agent.stop()
            except Exception as e:
                logger.error(f"Erreur arrêt {agent.config.restaurant_name} : {e}")


# ── FastAPI Admin API ─────────────────────────────────────────

app = FastAPI(title="AlloResto Service Manager")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ServiceManager()


@app.get("/health")
async def health():
    running = sum(1 for a in manager.agents.values() if a.state == AgentState.RUNNING)
    total_calls = sum(a.active_calls for a in manager.agents.values())
    uptime = (datetime.now(timezone.utc) - manager.start_time).total_seconds()
    return {
        "status": "ok",
        "activeAgents": running,
        "totalAgents": len(manager.agents),
        "totalActiveCalls": total_calls,
        "uptimeSeconds": round(uptime),
    }


@app.get("/agents")
async def list_agents():
    return [a.to_dict() for a in manager.agents.values()]


@app.get("/agents/{restaurant_id}/status")
async def agent_status(restaurant_id: str):
    agent = manager.agents.get(restaurant_id)
    if not agent:
        raise HTTPException(404, "Agent non trouvé")
    # Force fresh health check
    await agent.health_check()
    return agent.to_dict()


@app.post("/agents/{restaurant_id}/start")
async def start_agent(restaurant_id: str):
    agent = manager.agents.get(restaurant_id)
    if not agent:
        raise HTTPException(404, "Agent non trouvé")
    if agent.state == AgentState.RUNNING:
        raise HTTPException(400, "Agent déjà en cours d'exécution")
    try:
        await agent.start()
        return {"status": "started", "restaurantId": restaurant_id}
    except Exception as e:
        raise HTTPException(500, f"Échec démarrage : {e}")


@app.post("/agents/{restaurant_id}/stop")
async def stop_agent(restaurant_id: str):
    agent = manager.agents.get(restaurant_id)
    if not agent:
        raise HTTPException(404, "Agent non trouvé")
    await agent.stop()
    return {"status": "stopped", "restaurantId": restaurant_id}


@app.post("/agents/{restaurant_id}/restart")
async def restart_agent(restaurant_id: str):
    agent = manager.agents.get(restaurant_id)
    if not agent:
        raise HTTPException(404, "Agent non trouvé")
    try:
        await agent.restart()
        return {"status": "restarted", "restaurantId": restaurant_id}
    except Exception as e:
        raise HTTPException(500, f"Échec restart : {e}")


@app.post("/refresh")
async def refresh_agents():
    await manager.refresh()
    return {"status": "refreshed", "count": len(manager.agents)}


# ── Main ──────────────────────────────────────────────────────

async def main():
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY requis")
        sys.exit(1)

    logger.info(f"Service Manager démarrage (port={SERVICE_MANAGER_PORT})")
    logger.info(f"  NEXT_API_URL = {NEXT_API_URL}")
    logger.info(f"  APP_BASE_PORT = {APP_BASE_PORT}")
    logger.info(f"  BRIDGE_BASE_PORT = {BRIDGE_BASE_PORT}")

    # Graceful shutdown
    loop = asyncio.get_event_loop()

    def _shutdown():
        logger.info("Signal reçu, arrêt en cours...")
        asyncio.ensure_future(manager.stop_all())
        # Force exit after 10s if graceful shutdown hangs
        loop.call_later(10, lambda: os._exit(0))

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown)

    # Admin API — start FIRST so the admin page works immediately
    logger.info(f"Démarrage API admin sur 0.0.0.0:{SERVICE_MANAGER_PORT}")
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=SERVICE_MANAGER_PORT,
        log_level="info",
    )
    server = uvicorn.Server(config)

    # Initial discovery in background (don't block uvicorn startup)
    async def _initial_setup():
        await asyncio.sleep(1)  # let uvicorn start first
        try:
            await manager.refresh()
        except Exception as e:
            logger.error(f"Erreur lors du refresh initial : {e}")

    setup_task = asyncio.create_task(_initial_setup())

    # Background tasks
    health_task = asyncio.create_task(manager.health_loop())
    refresh_task = asyncio.create_task(manager.refresh_loop())

    try:
        await server.serve()
    finally:
        manager._running = False
        setup_task.cancel()
        health_task.cancel()
        refresh_task.cancel()
        await manager.stop_all()
        logger.info("Service Manager arrêté")


if __name__ == "__main__":
    asyncio.run(main())
