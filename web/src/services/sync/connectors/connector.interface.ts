/**
 * Interface commune à tous les connecteurs de plateforme.
 *
 * Chaque plateforme (Zenchef, TheFork, SevenRooms, etc.) implémente
 * cette interface pour garantir un contrat uniforme.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ReservationSyncDTO {
  /** Nom du client */
  customerName: string;
  /** Téléphone du client */
  customerPhone: string;
  /** Email du client (optionnel) */
  customerEmail?: string;
  /** Nombre de couverts */
  partySize: number;
  /** Adultes (optionnel, détail de partySize) */
  adults?: number;
  /** Enfants */
  children?: number;
  /** Date/heure de réservation (ISO 8601) */
  reservationTime: string;
  /** Durée en minutes */
  durationMin?: number;
  /** ID du service (mapping externe) */
  serviceExternalId?: string;
  /** ID de la salle (mapping externe) */
  diningRoomExternalId?: string;
  /** IDs des tables (mapping externe) */
  tableExternalIds?: string[];
  /** ID de l'offre (mapping externe) */
  offerExternalId?: string;
  /** Statut */
  status?: string;
  /** Notes / demandes spéciales */
  notes?: string;
  /** Allergies */
  allergies?: string[];
  /** Restrictions alimentaires */
  dietaryRestrictions?: string[];
  /** Occasion */
  occasion?: string;
}

export interface AvailabilitySlot {
  /** Heure du créneau (HH:MM) */
  time: string;
  /** Places restantes */
  remainingCovers: number;
  /** ID du service sur la plateforme */
  serviceExternalId?: string;
}

export interface WebhookEvent {
  /** Type d'événement */
  eventType:
    | "reservation.created"
    | "reservation.updated"
    | "reservation.cancelled"
    | "reservation.status_changed"
    | "customer.updated"
    | "availability.changed";
  /** ID externe de l'entité concernée */
  externalId: string;
  /** Payload complet reçu de la plateforme */
  rawPayload: Record<string, any>;
  /** Données parsées (selon le type) */
  data: Record<string, any>;
}

export interface SyncEntityResult {
  /** ID externe attribué / mis à jour */
  externalId: string;
  /** Payload brut retourné par la plateforme */
  rawData: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Interface principale
// ---------------------------------------------------------------------------

export interface PlatformConnector {
  /** Identifiant de la plateforme (ex: "zenchef", "thefork") */
  readonly platform: string;

  // --- Auth ---

  /**
   * Initialise l'authentification avec les credentials stockés.
   * Doit être appelé avant tout autre appel API.
   */
  authenticate(credentials: Record<string, any>): Promise<void>;

  // --- Réservations ---

  /** Crée une réservation sur la plateforme distante */
  createReservation(data: ReservationSyncDTO): Promise<SyncEntityResult>;

  /** Met à jour une réservation existante */
  updateReservation(
    externalId: string,
    data: Partial<ReservationSyncDTO>,
  ): Promise<SyncEntityResult>;

  /** Annule une réservation */
  cancelReservation(externalId: string, reason?: string): Promise<void>;

  // --- Disponibilités ---

  /** Récupère les créneaux disponibles pour une date et taille de groupe */
  getAvailability(date: string, partySize: number): Promise<AvailabilitySlot[]>;

  /** Push les disponibilités vers la plateforme (optionnel) */
  pushAvailability?(services: { externalId: string; slots: AvailabilitySlot[] }[]): Promise<void>;

  // --- Entités mappées (plan de salle, services, offres) ---

  /** Synchronise une entité locale vers la plateforme */
  syncEntity(
    type: string,
    localData: Record<string, any>,
    externalId?: string,
  ): Promise<SyncEntityResult>;

  // --- Webhooks ---

  /** Parse et valide un webhook entrant de la plateforme */
  parseWebhook(headers: Record<string, string>, body: Record<string, any>): Promise<WebhookEvent>;
}
