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
  condition?: { configKey: string; operator: "eq" | "neq" | "truthy" | "falsy"; value?: any };
  triggersHangup?: boolean;
  triggersTransfer?: boolean;
  mutesClientAudio?: boolean;
  skipResponseCreate?: boolean;
  sortOrder: number;
}

const BASE = "={{BASE_URL}}";

export const ALLORESTO_TOOL_DEFINITIONS: ToolDef[] = [
  // ─── check_availability ───
  {
    name: "check_availability",
    description:
      "Verifie si le restaurant peut accepter une commande ou reservation. OBLIGATOIRE : appeler AVANT confirm_order ou confirm_reservation. Pour la livraison, demander l'adresse au client d'abord.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["pickup", "delivery", "reservation"], description: "Type de service demande" },
        requested_time: { type: "string", description: "Heure souhaitee par le client (format HH:MM). Laisser vide = des que possible." },
        customer_address: { type: "string", description: "Adresse de livraison (obligatoire si mode=delivery)" },
        customer_city: { type: "string", description: "Ville de livraison" },
        customer_postal_code: { type: "string", description: "Code postal de livraison" },
        party_size: { type: "integer", description: "Nombre de personnes (obligatoire si mode=reservation)" },
        seating_preference: {
          type: "string",
          enum: ["window", "outdoor", "large_table", "quiet", "bar"],
          description: "Preference de placement (reservation uniquement)",
        },
      },
      required: ["mode"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/availability/check`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        mode: "={{$ai.mode}}",
        requestedTime: "={{$ai.requested_time}}",
        customerAddress: "={{$ai.customer_address}}",
        customerCity: "={{$ai.customer_city}}",
        customerPostalCode: "={{$ai.customer_postal_code}}",
        partySize: "={{$ai.party_size}}",
        seatingPreference: "={{$ai.seating_preference}}",
        customerLat: "={{ctx.customer_delivery_lat}}",
        customerLng: "={{ctx.customer_delivery_lng}}",
      },
    },
    contextUpdates: {
      last_availability_check: "={{$res}}",
      customer_delivery_lat: "={{$res.customerLat}}",
      customer_delivery_lng: "={{$res.customerLng}}",
    },
    extraCostResponseField: "={{$res.apiCosts}}",
    sortOrder: 1,
  },

  // ─── confirm_order ───
  {
    name: "confirm_order",
    description:
      "Enregistre la commande finale. REGLES : 1) check_availability DOIT avoir ete appele avant et avoir retourne OK. 2) Le client DOIT avoir confirme oralement la liste des articles et le total. Ne JAMAIS appeler sans ces 2 conditions.",
    parameters: {
      type: "object",
      properties: {
        order_type: { type: "string", enum: ["pickup", "delivery", "dine_in"], description: "Mode de commande" },
        items: {
          type: "array",
          description: "Liste des articles commandes avec leur #id du menu",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "Numero #id de l'article tel qu'affiche dans le menu" },
              quantity: { type: "integer", description: "Quantite commandee" },
              unit_price: { type: "number", description: "Prix unitaire de l'article" },
              selected_options: {
                type: "array",
                description: "Options choisies pour cet article (sauce, cuisson, etc.)",
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
              notes: { type: "string", description: "Instructions speciales pour cet article" },
            },
            required: ["id", "quantity", "unit_price"],
          },
        },
        subtotal: { type: "number", description: "Sous-total avant frais de livraison" },
        delivery_fee: { type: "number", description: "Frais de livraison (0 si pickup)" },
        total: { type: "number", description: "Total TTC a payer" },
        payment_method: { type: "string", enum: ["cash", "card", "online"], description: "Moyen de paiement choisi" },
        notes: { type: "string", description: "Instructions generales pour la commande" },
      },
      required: ["order_type", "items", "total"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/ai/tools/confirm-order`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        order_type: "={{$ai.order_type}}",
        items: "={{$ai.items}}",
        total: "={{$ai.total}}",
        subtotal: "={{$ai.subtotal}}",
        delivery_fee: "={{$ai.delivery_fee}}",
        payment_method: "={{$ai.payment_method}}",
        notes: "={{$ai.notes}}",
        item_map: "={{ctx.item_map}}",
        call_id: "={{ctx.call_id}}",
        customer_id: "={{ctx.customer_id}}",
        customer_name: "={{ctx.customer_name}}",
        caller_phone: "={{ctx.caller_phone}}",
        last_availability_check: "={{ctx.last_availability_check}}",
      },
    },
    sortOrder: 2,
  },

  // ─── confirm_reservation ───
  {
    name: "confirm_reservation",
    description: "Enregistre une reservation de table. REGLES : check_availability mode=reservation DOIT avoir ete appele avant et avoir retourne OK. Demander nom, telephone, nombre de personnes et heure au client.",
    condition: { configKey: "reservationEnabled", operator: "truthy" },
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Nom du client pour la reservation" },
        customer_phone: { type: "string", description: "Telephone du client" },
        party_size: { type: "integer", description: "Nombre de personnes" },
        reservation_time: { type: "string", description: "Heure souhaitee (HH:MM)" },
        seating_preference: {
          type: "string",
          enum: ["window", "outdoor", "large_table", "quiet", "bar"],
          description: "Preference de placement si demandee par le client",
        },
        service_id: { type: "string" },
        offer_id: { type: "string" },
        notes: { type: "string", description: "Remarques ou demandes speciales" },
      },
      required: ["customer_name", "customer_phone", "party_size", "reservation_time"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/reservations`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        callId: "={{ctx.call_id}}",
        customerId: "={{ctx.customer_id}}",
        customerName: "={{$ai.customer_name}}",
        customerPhone: "={{$ai.customer_phone}}",
        partySize: "={{$ai.party_size}}",
        reservationTime: "={{ctx.last_availability_check.estimatedTimeISO}}",
        status: "confirmed",
        seatingPreference: "={{$ai.seating_preference}}",
        notes: "={{$ai.notes}}",
      },
    },
    sortOrder: 3,
  },

  // ─── save_customer_info ───
  {
    name: "save_customer_info",
    description: "Sauvegarde les infos du client (prenom, adresse de livraison). Appeler quand le client donne son nom ou une adresse pour la premiere fois.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "Prenom du client" },
        delivery_address: { type: "string", description: "Adresse de livraison complete" },
        delivery_city: { type: "string", description: "Ville de livraison" },
        delivery_postal_code: { type: "string", description: "Code postal" },
        delivery_notes: { type: "string", description: "Indications pour le livreur (digicode, etage, etc.)" },
      },
    },
    http: {
      method: "POST",
      url: `${BASE}/api/customers`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        phone: "={{ctx.caller_phone}}",
        firstName: "={{$ai.first_name}}",
        deliveryAddress: "={{$ai.delivery_address}}",
        deliveryCity: "={{$ai.delivery_city}}",
        deliveryPostalCode: "={{$ai.delivery_postal_code}}",
        deliveryNotes: "={{$ai.delivery_notes}}",
        deliveryLat: "={{ctx.customer_delivery_lat}}",
        deliveryLng: "={{ctx.customer_delivery_lng}}",
      },
    },
    contextUpdates: {
      customer_id: "={{$res.id}}",
      customer_name: "={{$res.firstName}}",
    },
    sortOrder: 4,
  },

  // ─── log_new_faq ───
  {
    name: "log_new_faq",
    description: "Remonte une question du client a laquelle tu n'as PAS pu repondre car l'info n'est pas dans ton contexte. Le restaurateur verra la question et pourra ajouter la reponse. Ne pas utiliser pour les questions auxquelles tu as deja repondu.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "La question exacte posee par le client" },
        category: {
          type: "string",
          description: "Categorie de la question",
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
        restaurantId: "={{config.restaurantId}}",
        question: "={{$ai.question}}",
        category: "={{$ai.category}}",
        callerPhone: "={{ctx.caller_phone}}",
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
    description: "Enregistre un message du client pour le restaurateur. Utiliser quand le client veut laisser un message, faire une reclamation, demander un rappel, ou faire une demande speciale. TOUJOURS resumer clairement ce que le client a dit dans 'content'.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Resume clair et complet du message du client. Inclure tous les details importants mentionnes." },
        caller_name: { type: "string", description: "Nom du client si connu" },
        category: {
          type: "string",
          description: "Type de message",
          enum: ["callback_request", "complaint", "info_request", "special_request", "other"],
        },
        is_urgent: { type: "boolean", description: "Marquer urgent si le client insiste sur l'urgence" },
      },
      required: ["content", "category"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/messages`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        callId: "={{ctx.call_id}}",
        callerPhone: "={{ctx.caller_phone}}",
        callerName: "={{$ai.caller_name}}",
        content: "={{$ai.content}}",
        category: "={{$ai.category}}",
        isUrgent: "={{$ai.is_urgent}}",
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
    description: "Recherche les commandes recentes du client. Utiliser quand le client demande ou en est sa commande. Le telephone est recupere automatiquement du contexte de l'appel.",
    condition: { configKey: "orderStatusEnabled", operator: "truthy" },
    parameters: {
      type: "object",
      properties: {
        customer_phone: { type: "string", description: "Telephone du client (utiliser le numero de l'appelant)" },
      },
      required: ["customer_phone"],
    },
    http: {
      method: "GET",
      url: `${BASE}/api/orders/status?restaurantId={{config.restaurantId}}&phone={{$ai.customer_phone}}`,
    },
    sortOrder: 7,
  },

  // ─── cancel_order ───
  {
    name: "cancel_order",
    description: "Annule une commande du client. Possible uniquement si la commande est en statut 'pending' ou 'confirmed'. Demander confirmation au client avant d'annuler.",
    condition: { configKey: "orderStatusEnabled", operator: "truthy" },
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "integer", description: "Numero de la commande a annuler" },
      },
      required: ["order_number"],
    },
    http: {
      method: "POST",
      url: `${BASE}/api/ai/tools/cancel-order`,
      bodyTemplate: {
        restaurantId: "={{config.restaurantId}}",
        order_number: "={{$ai.order_number}}",
        caller_phone: "={{ctx.caller_phone}}",
      },
    },
    sortOrder: 8,
  },

  // ─── lookup_reservation ───
  {
    name: "lookup_reservation",
    description: "Recherche les reservations a venir du client. Utiliser quand le client veut verifier, modifier ou annuler une reservation existante.",
    condition: { configKey: "reservationEnabled", operator: "truthy" },
    parameters: {
      type: "object",
      properties: {
        customer_phone: { type: "string", description: "Telephone du client (utiliser le numero de l'appelant)" },
      },
      required: ["customer_phone"],
    },
    http: {
      method: "GET",
      url: `${BASE}/api/reservations/lookup?restaurantId={{config.restaurantId}}&phone={{$ai.customer_phone}}`,
    },
    sortOrder: 9,
  },

  // ─── cancel_reservation ───
  {
    name: "cancel_reservation",
    description: "Annule une reservation existante. Utiliser lookup_reservation d'abord pour trouver l'ID de la reservation. Demander confirmation au client avant d'annuler.",
    condition: { configKey: "reservationEnabled", operator: "truthy" },
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
        id: "={{$ai.reservation_id}}",
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
    description: "Transfere l'appel vers un employe du restaurant. Utiliser UNIQUEMENT si le client demande explicitement a parler a quelqu'un, ou si tu ne peux pas du tout repondre a sa demande.",
    condition: { configKey: "transferEnabled", operator: "truthy" },
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Raison du transfert (ex: 'Le client souhaite parler au responsable')" },
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
    description: "Termine et raccroche l'appel. Appeler UNIQUEMENT apres avoir dit au revoir au client et qu'il a confirme qu'il n'a plus besoin de rien.",
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
