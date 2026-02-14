/**
 * Definitions des 12 ToolConfigs pour sip-agent-server.
 * Source unique — utilisee par le service de provisioning.
 */

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, any>;
  http: Record<string, any> | null;
  contextUpdates?: Record<string, string>;
  extraCostResponseField?: string;
  triggersHangup?: boolean;
  triggersTransfer?: boolean;
  mutesClientAudio?: boolean;
  skipResponseCreate?: boolean;
  sortOrder: number;
}

const BASE = "{{BASE_URL}}";

export const ALLORESTO_TOOL_DEFINITIONS: ToolDef[] = [
  // ─── check_availability ───
  {
    name: "check_availability",
    description:
      "Verifie la disponibilite selon le mode (pickup, delivery, reservation). OBLIGATOIRE avant confirm_order ou confirm_reservation.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["pickup", "delivery", "reservation"] },
        requested_time: { type: "string", description: "Heure souhaitee (HH:MM)" },
        customer_address: { type: "string" },
        customer_city: { type: "string" },
        customer_postal_code: { type: "string" },
        party_size: { type: "integer" },
        seating_preference: {
          type: "string",
          enum: ["window", "outdoor", "large_table", "quiet", "bar"],
        },
      },
      required: ["mode"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/availability/check`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        mode: "{{args.mode}}",
        requestedTime: "{{args.requested_time}}",
        customerAddress: "{{args.customer_address}}",
        customerCity: "{{args.customer_city}}",
        customerPostalCode: "{{args.customer_postal_code}}",
        partySize: "{{args.party_size}}",
        seatingPreference: "{{args.seating_preference}}",
        customerLat: "{{ctx.customer_delivery_lat}}",
        customerLng: "{{ctx.customer_delivery_lng}}",
      },
    },
    contextUpdates: {
      last_availability_check: "$response",
      customer_delivery_lat: "$.customerLat",
      customer_delivery_lng: "$.customerLng",
    },
    extraCostResponseField: "$.apiCosts",
    sortOrder: 1,
  },

  // ─── confirm_order ───
  {
    name: "confirm_order",
    description:
      "Confirme et enregistre la commande. Appeler UNIQUEMENT apres check_availability OK + confirmation client.",
    parameters: {
      type: "object",
      properties: {
        order_type: { type: "string", enum: ["pickup", "delivery", "dine_in"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "Numero #id de l'article" },
              quantity: { type: "integer" },
              unit_price: { type: "number" },
              selected_options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    choice_id: { type: "integer" },
                    choice: { type: "string" },
                    extra_price: { type: "number" },
                  },
                },
              },
              notes: { type: "string" },
            },
            required: ["id", "quantity", "unit_price"],
          },
        },
        subtotal: { type: "number" },
        delivery_fee: { type: "number" },
        total: { type: "number" },
        payment_method: { type: "string", enum: ["cash", "card", "online"] },
        notes: { type: "string" },
      },
      required: ["order_type", "items", "total"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/ai/tools/confirm-order`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        order_type: "{{args.order_type}}",
        items: "{{args.items}}",
        total: "{{args.total}}",
        subtotal: "{{args.subtotal}}",
        delivery_fee: "{{args.delivery_fee}}",
        payment_method: "{{args.payment_method}}",
        notes: "{{args.notes}}",
        item_map: "{{ctx.item_map}}",
        call_id: "{{ctx.call_id}}",
        customer_id: "{{ctx.customer_id}}",
        customer_name: "{{ctx.customer_name}}",
        caller_phone: "{{ctx.caller_phone}}",
        last_availability_check: "{{ctx.last_availability_check}}",
      },
    },
    sortOrder: 2,
  },

  // ─── confirm_reservation ───
  {
    name: "confirm_reservation",
    description: "Confirme et enregistre une reservation de table.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        party_size: { type: "integer" },
        reservation_time: { type: "string", description: "Heure (HH:MM)" },
        seating_preference: {
          type: "string",
          enum: ["window", "outdoor", "large_table", "quiet", "bar"],
        },
        service_id: { type: "string" },
        offer_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customer_name", "customer_phone", "party_size", "reservation_time"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/reservations`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        callId: "{{ctx.call_id}}",
        customerId: "{{ctx.customer_id}}",
        customerName: "{{args.customer_name}}",
        customerPhone: "{{args.customer_phone}}",
        partySize: "{{args.party_size}}",
        reservationTime: "{{ctx.last_availability_check.estimatedTimeISO}}",
        status: "confirmed",
        seatingPreference: "{{args.seating_preference}}",
        notes: "{{args.notes}}",
      },
    },
    sortOrder: 3,
  },

  // ─── save_customer_info ───
  {
    name: "save_customer_info",
    description: "Sauvegarde le prenom ou une nouvelle adresse du client.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        delivery_address: { type: "string" },
        delivery_city: { type: "string" },
        delivery_postal_code: { type: "string" },
        delivery_notes: { type: "string" },
      },
    },
    http: {
      method: "POST",
      url: `${BASE}/api/customers`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        phone: "{{ctx.caller_phone}}",
        firstName: "{{args.first_name}}",
        deliveryAddress: "{{args.delivery_address}}",
        deliveryCity: "{{args.delivery_city}}",
        deliveryPostalCode: "{{args.delivery_postal_code}}",
        deliveryNotes: "{{args.delivery_notes}}",
        deliveryLat: "{{ctx.customer_delivery_lat}}",
        deliveryLng: "{{ctx.customer_delivery_lng}}",
      },
    },
    contextUpdates: {
      customer_id: "$.id",
      customer_name: "$.firstName",
    },
    sortOrder: 4,
  },

  // ─── log_new_faq ───
  {
    name: "log_new_faq",
    description: "Remonte une question du client ABSENTE de la FAQ.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        category: {
          type: "string",
          enum: [
            "horaires",
            "livraison",
            "allergens",
            "paiement",
            "parking",
            "reservation",
            "promotion",
            "ingredients",
            "localisation",
            "info_restau",
            "other",
          ],
        },
      },
      required: ["question", "category"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/faq`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        question: "{{args.question}}",
        category: "{{args.category}}",
        callerPhone: "{{ctx.caller_phone}}",
      },
      responseMapping: {
        success: "true",
        message: "Question remontee au restaurateur",
      },
    },
    sortOrder: 5,
  },

  // ─── leave_message ───
  {
    name: "leave_message",
    description: "Laisse un message pour le restaurant.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string" },
        caller_name: { type: "string" },
        category: {
          type: "string",
          enum: ["callback_request", "complaint", "info_request", "special_request", "other"],
        },
        is_urgent: { type: "boolean" },
      },
      required: ["content", "category"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/messages`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        callId: "{{ctx.call_id}}",
        callerPhone: "{{ctx.caller_phone}}",
        callerName: "{{args.caller_name}}",
        content: "{{args.content}}",
        category: "{{args.category}}",
        isUrgent: "{{args.is_urgent}}",
      },
      responseMapping: {
        success: "true",
        message: "Message transmis au restaurant",
      },
    },
    sortOrder: 6,
  },

  // ─── check_order_status ───
  {
    name: "check_order_status",
    description: "Recherche les commandes recentes du client par telephone.",
    parameters: {
      type: "object",
      properties: {
        customer_phone: { type: "string" },
      },
      required: ["customer_phone"],
    },
    http: {
      method: "GET",
      url: `${BASE}/api/orders/status?restaurantId={{config.restaurantId}}&phone={{args.customer_phone}}`,
    },
    sortOrder: 7,
  },

  // ─── cancel_order ───
  {
    name: "cancel_order",
    description: "Annule une commande (uniquement si pending ou confirmed).",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "integer" },
      },
      required: ["order_number"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/ai/tools/cancel-order`,
      bodyTemplate: {
        restaurantId: "{{config.restaurantId}}",
        order_number: "{{args.order_number}}",
        caller_phone: "{{ctx.caller_phone}}",
      },
    },
    sortOrder: 8,
  },

  // ─── lookup_reservation ───
  {
    name: "lookup_reservation",
    description: "Recherche les reservations a venir du client par telephone.",
    parameters: {
      type: "object",
      properties: {
        customer_phone: { type: "string" },
      },
      required: ["customer_phone"],
    },
    http: {
      method: "GET",
      url: `${BASE}/api/reservations/lookup?restaurantId={{config.restaurantId}}&phone={{args.customer_phone}}`,
    },
    sortOrder: 9,
  },

  // ─── cancel_reservation ───
  {
    name: "cancel_reservation",
    description: "Annule une reservation.",
    parameters: {
      type: "object",
      properties: {
        reservation_id: { type: "string" },
      },
      required: ["reservation_id"],
    },
    http: {
      method: "PATCH",
      url: `${BASE}/api/reservations`,
      bodyTemplate: {
        id: "{{args.reservation_id}}",
        status: "cancelled",
      },
      responseMapping: {
        success: "true",
        message: "Reservation annulee",
      },
    },
    sortOrder: 10,
  },

  // ─── transfer_call ───
  {
    name: "transfer_call",
    description: "Transfere l'appel vers un humain du restaurant.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
    http: null,
    triggersTransfer: true,
    mutesClientAudio: true,
    sortOrder: 11,
  },

  // ─── end_call ───
  {
    name: "end_call",
    description: "Raccroche l'appel. Appeler APRES avoir dit au revoir au client.",
    parameters: {
      type: "object",
      properties: {},
    },
    http: null,
    triggersHangup: true,
    mutesClientAudio: true,
    skipResponseCreate: true,
    sortOrder: 12,
  },
];
