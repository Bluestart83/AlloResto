/**
 * Types bruts de l'API Zenchef (Formitable v1.2).
 * Ces types ne sortent jamais du dossier zenchef/ — le mapper convertit vers/depuis.
 */

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface ZenchefCredentials {
  apiKey: string;
  restaurantUid: string;
}

// ---------------------------------------------------------------------------
// Booking request (POST / PUT body)
// ---------------------------------------------------------------------------

export interface ZenchefBookingRequest {
  booking_date_time: string;       // ISO 8601
  booking_duration: number;        // minutes
  number_of_people: number;
  culture: string;                 // "fr-FR", "en-GB", etc.
  first_name: string;
  last_name: string;
  telephone: string;
  email?: string;
  comments?: string;
  tables?: string[];               // table external IDs
  external_reference_id?: string;  // notre reservation.id local
  walk_in?: boolean;
  company?: boolean;
  company_name?: string;
  color?: string;                  // hex, ex: "#3edca8"
}

// ---------------------------------------------------------------------------
// Booking response (GET)
// ---------------------------------------------------------------------------

export interface ZenchefBookingResponse {
  uid: string;
  booking_date_time: string;
  booking_duration: number;
  number_of_people: number;
  culture: string;
  first_name: string;
  last_name: string;
  telephone: string;
  email: string;
  comments: string;
  tables: ZenchefTableRef[];
  external_reference_id: string;
  walk_in: boolean;
  company: boolean;
  company_name: string;
  status: ZenchefBookingStatus;
  created: string;
  source: string;
  color: string;
  pre_paid_amount: number;
  option_expires: string | null;
  [key: string]: any;
}

export interface ZenchefTableRef {
  uid: string;
  name: string;
  [key: string]: any;
}

export type ZenchefBookingStatus =
  | "pending"
  | "accepted"
  | "changed"
  | "canceled"
  | "checked_in"
  | "checked_out";

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface ZenchefAvailabilitySlot {
  time: string;       // "HH:MM"
  available: boolean;
  [key: string]: any;
}

export interface ZenchefDayAvailabilityResponse {
  date: string;
  number_of_people: number;
  slots: ZenchefAvailabilitySlot[];
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export type ZenchefWebhookEventType =
  | "booking.created"
  | "booking.accepted"
  | "booking.changed"
  | "booking.canceled"
  | "booking.checkin"
  | "booking.checkout";

export interface ZenchefWebhookPayload {
  event: ZenchefWebhookEventType;
  restaurant_uid: string;
  booking: ZenchefBookingResponse;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface ZenchefErrorResponse {
  error: string;
  message: string;
  status_code: number;
}
