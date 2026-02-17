/**
 * Mastering service — Phase 5
 *
 * Détermine qui est la source de vérité pour chaque type d'entité
 * et résout les conflits entre données locales et distantes.
 */
import { getDb } from "@/lib/db";
import type { SyncPlatformConfig } from "@/db/entities/SyncPlatformConfig";
import type { Reservation } from "@/db/entities/Reservation";

const PLATFORM_SOURCES = [
  "thefork",
  "zenchef",
  "resengo",
  "sevenrooms",
  "opentable",
  "guestonline",
];

const LOCAL_STATUSES = ["seated", "completed", "no_show"];

export interface ConflictResolution {
  winner: "local" | "remote";
  merged: Record<string, any>;
  description: string;
}

/**
 * Détermine qui est master pour un type d'entité donné, pour un restaurant.
 * Retourne le nom de la plateforme master, ou "self" si c'est notre outil.
 */
export async function getMaster(restaurantId: string, entityType: string): Promise<string> {
  const db = await getDb();
  const configRepo = db.getRepository<SyncPlatformConfig>("sync_platform_configs");

  const configs = await configRepo.find({
    where: { restaurantId, isActive: true },
  });

  for (const config of configs) {
    if (config.masterFor.includes(entityType)) {
      return config.platform;
    }
  }

  return "self";
}

/**
 * Pour les réservations : le master dépend de la source ET du statut.
 * Une fois le client sur place (seated+), c'est toujours nous.
 */
export function getReservationMaster(reservation: Reservation): string {
  if (LOCAL_STATUSES.includes(reservation.status)) {
    return "self";
  }

  if (PLATFORM_SOURCES.includes(reservation.source)) {
    return reservation.source;
  }

  return "self";
}

/**
 * Résout un conflit entre données locales et distantes.
 */
export function resolveConflict(
  entityType: string,
  _restaurantId: string,
  localData: Record<string, any>,
  remoteData: Record<string, any>,
  platform: string,
  master: string,
): ConflictResolution {
  // La plateforme est master → données distantes gagnent
  if (master === platform) {
    return {
      winner: "remote",
      merged: { ...localData, ...remoteData },
      description: `Master=${platform}, remote data applied`,
    };
  }

  // Notre outil est master → données locales gagnent
  if (master === "self") {
    // Cas spécial : les allergies sont toujours fusionnées (union)
    const merged = { ...localData };
    if (remoteData.allergies && Array.isArray(remoteData.allergies)) {
      merged.allergies = [
        ...new Set([...(localData.allergies || []), ...remoteData.allergies]),
      ];
      return {
        winner: "local",
        merged,
        description: `Master=self, selective merge on allergies`,
      };
    }

    return {
      winner: "local",
      merged: localData,
      description: `Master=self, local data kept, remote discarded`,
    };
  }

  // Fallback : local gagne
  return {
    winner: "local",
    merged: localData,
    description: `Master=${master} (not matching platform=${platform}), local data kept`,
  };
}
