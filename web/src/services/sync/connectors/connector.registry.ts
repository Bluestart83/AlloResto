/**
 * Registry / Factory — instancie et authentifie les connecteurs par plateforme.
 * Point d'entrée unique pour obtenir un connecteur prêt à l'emploi.
 */
import type { PlatformConnector } from "./connector.interface";
import { getDb } from "@/lib/db";
import { SyncPlatformConfig } from "@/db/entities/SyncPlatformConfig";
import { ZenchefConnector } from "./zenchef/zenchef.connector";

// ---------------------------------------------------------------------------
// Constructeurs par plateforme
// ---------------------------------------------------------------------------

const CONNECTOR_CONSTRUCTORS: Record<string, new () => PlatformConnector> = {
  zenchef: ZenchefConnector,
  // Futurs connecteurs :
  // thefork: TheForkConnector,
  // sevenrooms: SevenRoomsConnector,
};

// ---------------------------------------------------------------------------
// Cache en mémoire (clé = "restaurantId:platform")
// ---------------------------------------------------------------------------

const connectorCache = new Map<string, PlatformConnector>();

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Obtient un connecteur authentifié pour une plateforme et un restaurant.
 * Charge les credentials depuis SyncPlatformConfig, instancie, authenticate, cache.
 *
 * @throws si la plateforme n'est pas supportée ou la config n'existe pas / inactive
 */
export async function getConnector(
  platform: string,
  restaurantId: string,
): Promise<PlatformConnector> {
  const cacheKey = `${restaurantId}:${platform}`;

  const cached = connectorCache.get(cacheKey);
  if (cached) return cached;

  const ConnectorClass = CONNECTOR_CONSTRUCTORS[platform];
  if (!ConnectorClass) {
    throw new Error(`Unsupported sync platform: "${platform}"`);
  }

  const db = await getDb();
  const config = await db.getRepository(SyncPlatformConfig).findOneBy({
    restaurantId,
    platform,
    isActive: true,
  });

  if (!config) {
    throw new Error(
      `No active SyncPlatformConfig for restaurant=${restaurantId}, platform=${platform}`,
    );
  }

  const connector = new ConnectorClass();
  await connector.authenticate({
    ...config.credentials,
    locale: await getRestaurantLocale(restaurantId),
    webhookSecret: config.webhookSecret,
  });

  connectorCache.set(cacheKey, connector);
  return connector;
}

/**
 * Invalide le cache pour un restaurant (quand les credentials changent).
 */
export function clearConnectorCache(
  restaurantId: string,
  platform?: string,
): void {
  if (platform) {
    connectorCache.delete(`${restaurantId}:${platform}`);
  } else {
    for (const key of connectorCache.keys()) {
      if (key.startsWith(`${restaurantId}:`)) {
        connectorCache.delete(key);
      }
    }
  }
}

/**
 * Liste les configs actives pour un restaurant.
 */
export async function getActiveConfigs(
  restaurantId: string,
): Promise<SyncPlatformConfig[]> {
  const db = await getDb();
  return db.getRepository(SyncPlatformConfig).find({
    where: { restaurantId, isActive: true },
  });
}

/**
 * Vérifie si une plateforme est supportée.
 */
export function isSupportedPlatform(platform: string): boolean {
  return platform in CONNECTOR_CONSTRUCTORS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRestaurantLocale(restaurantId: string): Promise<string> {
  const db = await getDb();
  const { Restaurant } = await import("@/db/entities/Restaurant");
  const r = await db.getRepository(Restaurant).findOneBy({ id: restaurantId });
  return r?.defaultLocale || "fr";
}
