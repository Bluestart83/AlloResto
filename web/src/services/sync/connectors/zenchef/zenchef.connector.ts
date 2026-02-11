/**
 * Connecteur Zenchef — implémente PlatformConnector via l'API Formitable v1.2.
 */
import type {
  PlatformConnector,
  ReservationSyncDTO,
  AvailabilitySlot,
  SyncEntityResult,
  WebhookEvent,
} from "../connector.interface";
import type {
  ZenchefBookingResponse,
} from "./zenchef.types";
import {
  toZenchefBooking,
  fromZenchefBooking,
  fromZenchefAvailability,
} from "./zenchef.mapper";
import { parseZenchefWebhook, validateZenchefSignature } from "./zenchef.webhooks";

const BASE_URL = "https://api.formitable.com/api/v1.2";

export class ZenchefConnector implements PlatformConnector {
  readonly platform = "zenchef";

  private apiKey = "";
  private restaurantUid = "";
  private locale = "fr";
  private webhookSecret: string | null = null;

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async authenticate(credentials: Record<string, any>): Promise<void> {
    if (!credentials.apiKey || !credentials.restaurantUid) {
      throw new Error("Zenchef credentials missing: apiKey and restaurantUid required");
    }
    this.apiKey = credentials.apiKey;
    this.restaurantUid = credentials.restaurantUid;
    if (credentials.locale) this.locale = credentials.locale;
    if (credentials.webhookSecret) this.webhookSecret = credentials.webhookSecret;
  }

  // ---------------------------------------------------------------------------
  // HTTP helper
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const url = `${BASE_URL}/${this.restaurantUid}${path}`;
    const headers: Record<string, string> = {
      ApiKey: this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const opts: RequestInit = { method, headers };
    if (body && method !== "GET" && method !== "DELETE") {
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Zenchef API ${method} ${path} → ${resp.status}: ${text}`);
    }
    if (resp.status === 204) return {} as T;
    return resp.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Reservations
  // ---------------------------------------------------------------------------

  async createReservation(data: ReservationSyncDTO): Promise<SyncEntityResult> {
    const booking = toZenchefBooking(data, this.locale);
    const resp = await this.request<ZenchefBookingResponse>("POST", "/booking", booking);
    return {
      externalId: resp.uid,
      rawData: resp as unknown as Record<string, any>,
    };
  }

  async updateReservation(
    externalId: string,
    data: Partial<ReservationSyncDTO>,
  ): Promise<SyncEntityResult> {
    // GET current state, merge, then PUT (Zenchef PUT = remplacement total)
    const current = await this.request<ZenchefBookingResponse>(
      "GET",
      `/booking/${externalId}`,
    );
    const merged = { ...fromZenchefBooking(current), ...data } as ReservationSyncDTO;
    const booking = toZenchefBooking(merged, this.locale);
    const resp = await this.request<ZenchefBookingResponse>(
      "PUT",
      `/booking/${externalId}`,
      booking,
    );
    return {
      externalId: resp.uid,
      rawData: resp as unknown as Record<string, any>,
    };
  }

  async cancelReservation(_externalId: string, _reason?: string): Promise<void> {
    await this.request("DELETE", `/booking/${_externalId}`);
  }

  // ---------------------------------------------------------------------------
  // Checkin / Checkout (spécifiques Zenchef)
  // ---------------------------------------------------------------------------

  async checkinBooking(externalId: string): Promise<void> {
    await this.request("PUT", `/booking/checkin/${externalId}`);
  }

  async checkoutBooking(externalId: string): Promise<void> {
    await this.request("PUT", `/booking/checkout/${externalId}`);
  }

  // ---------------------------------------------------------------------------
  // Availability
  // ---------------------------------------------------------------------------

  async getAvailability(date: string, partySize: number): Promise<AvailabilitySlot[]> {
    const lang = this.locale.split("-")[0] || "fr";
    const resp = await this.request<any>(
      "GET",
      `/availability/day/${date}/${partySize}/${lang}`,
    );
    return fromZenchefAvailability(resp);
  }

  // pushAvailability non supporté par l'API Zenchef

  // ---------------------------------------------------------------------------
  // Sync entity (générique)
  // ---------------------------------------------------------------------------

  async syncEntity(
    type: string,
    localData: Record<string, any>,
    externalId?: string,
  ): Promise<SyncEntityResult> {
    if (type === "booking" || type === "reservation") {
      if (externalId) {
        return this.updateReservation(externalId, localData as Partial<ReservationSyncDTO>);
      }
      return this.createReservation(localData as ReservationSyncDTO);
    }
    throw new Error(`ZenchefConnector: syncEntity type "${type}" not supported`);
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  async parseWebhook(
    headers: Record<string, string>,
    body: Record<string, any>,
  ): Promise<WebhookEvent> {
    if (this.webhookSecret) {
      validateZenchefSignature(headers, body, this.webhookSecret);
    }
    return parseZenchefWebhook(body);
  }

  // ---------------------------------------------------------------------------
  // Polling helpers
  // ---------------------------------------------------------------------------

  /**
   * Récupère les réservations récemment modifiées (fallback polling).
   */
  async getLatestBookings(
    intervalMinutes: number = 5,
    filter: "accepted" | "changed" | "canceled" = "changed",
  ): Promise<ZenchefBookingResponse[]> {
    const resp = await this.request<any>(
      "GET",
      `/booking/latest/${intervalMinutes}/${filter}`,
    );
    return resp.bookings || resp || [];
  }

  /**
   * Récupère une réservation par sa référence externe (notre reservation.id).
   */
  async getBookingByExternalRef(
    source: string,
    externalReferenceId: string,
  ): Promise<ZenchefBookingResponse | null> {
    try {
      return await this.request<ZenchefBookingResponse>(
        "GET",
        `/booking/external/${source}/${externalReferenceId}`,
      );
    } catch {
      return null;
    }
  }
}
