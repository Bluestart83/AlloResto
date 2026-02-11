/**
 * Interface commune à tous les connecteurs de plateforme.
 *
 * Chaque plateforme (Zenchef, TheFork, SevenRooms, etc.) implémente
 * cette interface pour garantir un contrat uniforme.
 */

// ---------------------------------------------------------------------------
// Types d'entités synchronisables
// ---------------------------------------------------------------------------

export type SyncEntityType =
  | "reservation"
  | "order"
  | "menu_item"
  | "offer"
  | "menu"
  | "table"
  | "dining_room"
  | "customer"
  | "availability";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ReservationSyncDTO {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  adults?: number;
  children?: number;
  reservationTime: string;
  durationMin?: number;
  serviceExternalId?: string;
  diningRoomExternalId?: string;
  tableExternalIds?: string[];
  offerExternalId?: string;
  status?: string;
  notes?: string;
  allergies?: string[];
  dietaryRestrictions?: string[];
  occasion?: string;
}

export interface OrderSyncDTO {
  status: string;
  type: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    options?: string[];
  }[];
  total: number;
  estimatedReadyAt?: string;
  notes?: string;
}

export interface MenuItemSyncDTO {
  name: string;
  description?: string;
  price: number;
  categoryName?: string;
  isAvailable: boolean;
  allergens?: string[];
  imageUrl?: string;
  options?: { label: string; priceModifier: number }[];
}

export interface OfferSyncDTO {
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
  /** Choix par étape (entrée, plat, dessert, etc.) */
  steps: {
    label: string;
    /** Noms ou IDs des items éligibles */
    itemRefs: string[];
    /** Prix max (si filtrage par prix) */
    maxPrice?: number;
  }[];
}

export interface MenuSyncDTO {
  categories: { name: string; sortOrder: number; items: MenuItemSyncDTO[] }[];
  offers: OfferSyncDTO[];
}

export interface TableSyncDTO {
  label: string;
  seats: number;
  diningRoomName?: string;
  isActive: boolean;
}

export interface DiningRoomSyncDTO {
  name: string;
  capacity: number;
  isActive: boolean;
}

export interface CustomerSyncDTO {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  locale?: string;
  notes?: string;
  allergies?: string[];
  vipStatus?: boolean;
  visitCount?: number;
}

export interface AvailabilitySlot {
  time: string;
  remainingCovers: number;
  serviceExternalId?: string;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  eventType:
    | "reservation.created"
    | "reservation.updated"
    | "reservation.cancelled"
    | "reservation.status_changed"
    | "order.created"
    | "order.updated"
    | "order.cancelled"
    | "menu.updated"
    | "offer.updated"
    | "table.updated"
    | "customer.updated"
    | "availability.changed";
  externalId: string;
  rawPayload: Record<string, any>;
  data: Record<string, any>;
}

export interface SyncEntityResult {
  externalId: string;
  rawData: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Interface principale
// ---------------------------------------------------------------------------

export interface PlatformConnector {
  readonly platform: string;

  // --- Auth ---
  authenticate(credentials: Record<string, any>): Promise<void>;

  // --- Réservations ---
  createReservation(data: ReservationSyncDTO): Promise<SyncEntityResult>;
  updateReservation(externalId: string, data: Partial<ReservationSyncDTO>): Promise<SyncEntityResult>;
  cancelReservation(externalId: string, reason?: string): Promise<void>;

  // --- Commandes ---
  syncOrder?(externalId: string, data: Partial<OrderSyncDTO>): Promise<SyncEntityResult>;

  // --- Menu (items + offres/formules = carte complète) ---
  pushMenu?(menu: MenuSyncDTO): Promise<{ items: SyncEntityResult[]; offers: SyncEntityResult[] }>;
  pullMenu?(): Promise<MenuSyncDTO>;
  pushMenuItems?(items: MenuItemSyncDTO[]): Promise<SyncEntityResult[]>;
  pullMenuItems?(): Promise<{ externalId: string; data: MenuItemSyncDTO }[]>;
  pushOffers?(offers: OfferSyncDTO[]): Promise<SyncEntityResult[]>;
  pullOffers?(): Promise<{ externalId: string; data: OfferSyncDTO }[]>;

  // --- Plan de salle ---
  pushTables?(tables: TableSyncDTO[]): Promise<SyncEntityResult[]>;
  pullTables?(): Promise<{ externalId: string; data: TableSyncDTO }[]>;
  pushDiningRooms?(rooms: DiningRoomSyncDTO[]): Promise<SyncEntityResult[]>;
  pullDiningRooms?(): Promise<{ externalId: string; data: DiningRoomSyncDTO }[]>;

  // --- Clients ---
  syncCustomer?(externalId: string | null, data: CustomerSyncDTO): Promise<SyncEntityResult>;
  pullCustomers?(since?: Date): Promise<{ externalId: string; data: CustomerSyncDTO }[]>;

  // --- Disponibilités ---
  getAvailability(date: string, partySize: number): Promise<AvailabilitySlot[]>;
  pushAvailability?(services: { externalId: string; slots: AvailabilitySlot[] }[]): Promise<void>;

  // --- Générique (fallback) ---
  syncEntity(type: string, localData: Record<string, any>, externalId?: string): Promise<SyncEntityResult>;

  // --- Webhooks ---
  parseWebhook(headers: Record<string, string>, body: Record<string, any>): Promise<WebhookEvent>;
}
