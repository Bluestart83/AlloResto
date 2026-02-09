/**
 * ai-prompt.service.ts
 *
 * Construit le system prompt + tools pour OpenAI Realtime API
 * à partir des données en BDD :
 *   - Menu complet avec prix et options
 *   - Config livraison (frais, minimum, seuil gratuit)
 *   - FAQ répondues (base de connaissances)
 *   - Client connu (prénom, adresse)
 *   - SIP credentials (propres au client ou fallback .env)
 *
 * Appelé par le SIP service Python via :
 *   GET /api/ai/prompt?restaurantId=xxx&callerPhone=0612345678
 */

import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";
import { PhoneLine } from "@/db/entities/PhoneLine";
import { MenuCategory } from "@/db/entities/MenuCategory";
import { MenuItem } from "@/db/entities/MenuItem";
import { Customer } from "@/db/entities/Customer";
import { Faq } from "@/db/entities/Faq";

// ============================================================
// TYPES
// ============================================================

export interface AiSessionConfig {
  systemPrompt: string;
  tools: Tool[];
  voice: string;
  customerContext: CustomerContext | null;
  sipCredentials: SipCredentials;
}

interface CustomerContext {
  id: string;
  firstName: string | null;
  phone: string;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryPostalCode: string | null;
  deliveryNotes: string | null;
  totalOrders: number;
  totalSpent: number;
}

interface SipCredentials {
  domain: string;
  username: string;
  password: string;
  source: "client" | "demo";
}

interface Tool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// ============================================================
// CUISINE TYPES — Liste exhaustive
// ============================================================

export const CUISINE_TYPES = [
  // Européen
  "pizza", "italien", "francais", "creperie", "burger", "bistrot",
  "brasserie", "gastronomique", "savoyard", "alsacien", "basque",
  "espagnol", "tapas", "portugais", "grec",
  // Asiatique
  "chinois", "japonais", "sushi", "ramen", "thai", "vietnamien",
  "pho", "coreen", "bbq_coreen", "indien", "pakistanais",
  "sri_lankais", "bangladeshi", "cambodgien", "indonesien",
  "malaisien", "philippin", "tibetain", "wok",
  // Moyen-Orient / Méditerranéen
  "kebab", "turc", "libanais", "syrien", "marocain", "tunisien",
  "algerien", "egyptien", "iranien", "israelien", "falafel",
  // Afrique
  "africain", "senegalais", "ethiopien", "malgache", "reunion",
  "antillais", "creole",
  // Amérique
  "mexicain", "tex_mex", "bresilien", "peruvien", "colombien",
  "americain", "bbq", "cajun", "canadien",
  // Fast food / Snack
  "fast_food", "sandwich", "bagel", "wrap", "poke_bowl",
  "salade", "healthy", "vegan", "vegetarien",
  // Sucré
  "patisserie", "boulangerie", "glace", "crepe_sucree",
  "donut", "bubble_tea",
  // Fruits de mer
  "poisson", "fruits_de_mer", "sushi_bar", "poke",
  // Autre
  "traiteur", "buffet", "food_truck", "other",
] as const;

export type CuisineType = (typeof CUISINE_TYPES)[number];

// ============================================================
// BUILD MENU TEXT
// ============================================================

function buildMenuText(
  categories: MenuCategory[],
  items: MenuItem[]
): string {
  const lines: string[] = ["MENU DU RESTAURANT :", ""];

  for (const cat of categories) {
    const catItems = items.filter(
      (i) => i.categoryId === cat.id && i.isAvailable
    );
    if (catItems.length === 0) continue;

    lines.push(`## ${cat.name}`);

    for (const item of catItems) {
      let line = `- ${item.name} : ${item.price.toFixed(2)}€`;
      if (item.description) line += ` — ${item.description}`;

      const options = item.options as any[];
      if (options?.length > 0) {
        for (const opt of options) {
          const choices = opt.choices
            .map((c: any) => {
              const extra =
                c.price_modifier > 0
                  ? ` (+${c.price_modifier.toFixed(2)}€)`
                  : "";
              return `${c.label}${extra}`;
            })
            .join(", ");
          line += `\n  ${opt.name} [${opt.required ? "obligatoire" : "optionnel"}] : ${choices}`;
        }
      }

      const allergens = item.allergens as string[];
      if (allergens?.length > 0) {
        line += `\n  Allergènes : ${allergens.join(", ")}`;
      }

      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// BUILD DELIVERY TEXT
// ============================================================

function buildDeliveryText(restaurant: Restaurant): string {
  if (!restaurant.deliveryEnabled) {
    return "LIVRAISON : Non disponible. Uniquement à emporter.";
  }

  const lines = [
    "LIVRAISON :",
    `- Rayon de livraison : ${restaurant.deliveryRadiusKm} km`,
    `- Commande minimum : ${restaurant.minOrderAmount.toFixed(2)}€`,
  ];

  if (restaurant.deliveryFreeAbove && restaurant.deliveryFreeAbove > 0) {
    lines.push(
      `- Frais de livraison : ${restaurant.deliveryFee.toFixed(2)}€ (GRATUIT au-dessus de ${restaurant.deliveryFreeAbove.toFixed(2)}€)`
    );
  } else if (restaurant.deliveryFee > 0) {
    lines.push(`- Frais de livraison : ${restaurant.deliveryFee.toFixed(2)}€`);
  } else {
    lines.push("- Frais de livraison : GRATUIT");
  }

  lines.push(`- Temps de préparation moyen : ${restaurant.avgPrepTimeMin} min`);

  return lines.join("\n");
}

// ============================================================
// BUILD FAQ TEXT (base de connaissances)
// ============================================================

function buildFaqText(faqs: Faq[]): string {
  if (faqs.length === 0) return "";

  const lines = [
    "",
    "BASE DE CONNAISSANCES (FAQ) :",
    "Si un client pose une de ces questions, réponds directement.",
    "",
  ];

  for (const faq of faqs) {
    lines.push(`Q: ${faq.question}`);
    lines.push(`R: ${faq.answer}`);
    lines.push("");
  }

  lines.push(
    "Si le client pose une question qui n'est PAS dans cette FAQ et que tu ne connais pas la réponse,",
    "appelle la fonction log_new_faq pour la remonter au restaurateur.",
    "Dis au client : \"Je n'ai pas cette information, je remonte votre question au restaurant.\""
  );

  return lines.join("\n");
}

// ============================================================
// BUILD SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(
  restaurant: Restaurant,
  menuText: string,
  deliveryText: string,
  faqText: string,
  customer: CustomerContext | null
): string {
  const customerSection = customer
    ? [
        "",
        "CLIENT IDENTIFIÉ :",
        `- Prénom : ${customer.firstName || "inconnu"}`,
        `- Téléphone : ${customer.phone}`,
        `- Commandes précédentes : ${customer.totalOrders}`,
        `- Total dépensé : ${customer.totalSpent.toFixed(2)}€`,
        customer.deliveryAddress
          ? `- Dernière adresse : ${customer.deliveryAddress}, ${customer.deliveryPostalCode || ""} ${customer.deliveryCity || ""}`
          : "- Pas d'adresse de livraison enregistrée",
        customer.deliveryNotes
          ? `- Notes de livraison : ${customer.deliveryNotes}`
          : "",
        "",
        "→ Accueille-le par son prénom et propose la même adresse si livraison.",
      ].join("\n")
    : "\nNOUVEAU CLIENT : Demande son prénom. Si livraison, demande l'adresse.";

  return `Tu es l'assistant vocal de ${restaurant.name} (restaurant ${restaurant.cuisineType || "autre"}).
${restaurant.aiInstructions || "Sois chaleureux, efficace, et aide le client à passer sa commande."}

RÈGLES :
- Parle en français naturel, comme un vrai employé au téléphone.
- Sois concis : pas de phrases trop longues (le client écoute, il ne lit pas).
- Répète toujours le récapitulatif de commande avant de confirmer.
- Calcule le total TTC et annonce-le clairement.
- Si un article n'est pas au menu, dis-le poliment et propose une alternative.
- Si le client demande les horaires ou l'adresse, réponds.

INFORMATIONS RESTAURANT :
- Nom : ${restaurant.name}
- Type : ${restaurant.cuisineType || "autre"}
- Adresse : ${restaurant.address}, ${restaurant.postalCode || ""} ${restaurant.city || ""}
- Téléphone : ${restaurant.phone || "non communiqué"}

${deliveryText}

TARIFICATION LIVRAISON :
- Si le total de la commande est inférieur à ${restaurant.minOrderAmount.toFixed(2)}€, refuse poliment la livraison et propose le retrait.
- Annonce les frais de livraison AVANT la confirmation.
- Le total final = total articles + frais de livraison.

${menuText}
${faqText}
${customerSection}

HORAIRES :
${JSON.stringify(restaurant.openingHours, null, 2)}

FONCTIONS À APPELER :
- confirm_order : quand la commande est confirmée par le client
- check_delivery_address : quand le client donne une adresse de livraison
- save_customer_info : quand le client donne son prénom ou une nouvelle adresse
- log_new_faq : quand le client pose une question ABSENTE de la FAQ et que tu ne connais pas la réponse`;
}

// ============================================================
// TOOLS (OpenAI function calling)
// ============================================================

function buildTools(): Tool[] {
  return [
    {
      type: "function",
      name: "confirm_order",
      description:
        "Confirme et enregistre la commande du client. Appeler UNIQUEMENT quand le client a explicitement confirmé.",
      parameters: {
        type: "object",
        properties: {
          order_type: {
            type: "string",
            enum: ["pickup", "delivery"],
            description: "Type de commande : retrait ou livraison",
          },
          items: {
            type: "array",
            description: "Liste des articles commandés",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom exact de l'article" },
                quantity: { type: "integer", description: "Quantité" },
                unit_price: { type: "number", description: "Prix unitaire en euros" },
                selected_options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      choice: { type: "string" },
                      extra_price: { type: "number" },
                    },
                  },
                  description: "Options choisies (taille, suppléments...)",
                },
                notes: {
                  type: "string",
                  description: "Remarques sur l'article (sans tomate, bien cuit...)",
                },
              },
              required: ["name", "quantity", "unit_price"],
            },
          },
          subtotal: { type: "number", description: "Sous-total articles en euros" },
          delivery_fee: {
            type: "number",
            description: "Frais de livraison (0 si retrait ou offert)",
          },
          total: {
            type: "number",
            description: "Total TTC (articles + livraison)",
          },
          delivery_address: {
            type: "string",
            description: "Adresse de livraison (si livraison)",
          },
          payment_method: {
            type: "string",
            enum: ["cash", "card", "online"],
            description: "Mode de paiement",
          },
          notes: { type: "string", description: "Notes générales" },
          estimated_time_min: {
            type: "integer",
            description: "Temps estimé annoncé au client",
          },
        },
        required: ["order_type", "items", "total"],
      },
    },
    {
      type: "function",
      name: "check_delivery_address",
      description:
        "Vérifie si une adresse est dans la zone de livraison et calcule le temps.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Adresse du client (rue + numéro)" },
          city: { type: "string", description: "Ville" },
          postal_code: { type: "string", description: "Code postal" },
        },
        required: ["address"],
      },
    },
    {
      type: "function",
      name: "save_customer_info",
      description:
        "Sauvegarde le prénom ou une nouvelle adresse du client.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "Prénom du client" },
          delivery_address: { type: "string", description: "Adresse de livraison" },
          delivery_city: { type: "string", description: "Ville" },
          delivery_postal_code: { type: "string", description: "Code postal" },
          delivery_notes: {
            type: "string",
            description: "Instructions (code porte, étage...)",
          },
        },
      },
    },
    {
      type: "function",
      name: "log_new_faq",
      description:
        "Remonte une question du client que tu ne trouves PAS dans la FAQ et dont tu ne connais PAS la réponse. Ne PAS appeler si la FAQ contient déjà la réponse.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "La question posée par le client, reformulée clairement",
          },
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
              "other",
            ],
            description: "Catégorie de la question",
          },
        },
        required: ["question", "category"],
      },
    },
  ];
}

// ============================================================
// RESOLVE SIP CREDENTIALS
// ============================================================
// Priorité : credentials du client en BDD > fallback .env (ligne démo)

async function resolveSipCredentials(
  restaurantId: string
): Promise<SipCredentials> {
  const ds = await getDb();

  const phoneLine = await ds.getRepository(PhoneLine).findOneBy({
    restaurantId,
    isActive: true,
  });

  // Si le client a ses propres credentials SIP
  if (phoneLine?.sipDomain && phoneLine?.sipUsername && phoneLine?.sipPassword) {
    return {
      domain: phoneLine.sipDomain,
      username: phoneLine.sipUsername,
      password: phoneLine.sipPassword,
      source: "client",
    };
  }

  // Fallback : ligne de démo (tes credentials dans .env)
  return {
    domain: process.env.SIP_DOMAIN || "sip.twilio.com",
    username: process.env.SIP_USERNAME || "",
    password: process.env.SIP_PASSWORD || "",
    source: "demo",
  };
}

// ============================================================
// MAIN — Génère la config complète pour une session IA
// ============================================================

export async function buildAiSessionConfig(
  restaurantId: string,
  callerPhone: string
): Promise<AiSessionConfig> {
  const ds = await getDb();

  // 1. Restaurant
  const restaurant = await ds.getRepository(Restaurant).findOneByOrFail({
    id: restaurantId,
  });

  // 2. Menu
  const categories = await ds.getRepository(MenuCategory).find({
    where: { restaurantId, isActive: true },
    order: { displayOrder: "ASC" },
  });

  const items = await ds.getRepository(MenuItem).find({
    where: { restaurantId, isAvailable: true },
    order: { displayOrder: "ASC" },
  });

  // 3. FAQ répondues (base de connaissances)
  const faqs = await ds.getRepository(Faq).find({
    where: { restaurantId, status: "answered" },
    order: { askCount: "DESC" },
  });

  // 4. Client connu ?
  let customerContext: CustomerContext | null = null;
  if (callerPhone) {
    const customer = await ds.getRepository(Customer).findOneBy({
      restaurantId,
      phone: callerPhone,
    });
    if (customer) {
      customerContext = {
        id: customer.id,
        firstName: customer.firstName,
        phone: customer.phone,
        deliveryAddress: customer.deliveryAddress,
        deliveryCity: customer.deliveryCity,
        deliveryPostalCode: customer.deliveryPostalCode,
        deliveryNotes: customer.deliveryNotes,
        totalOrders: customer.totalOrders,
        totalSpent: Number(customer.totalSpent),
      };
    }
  }

  // 5. SIP credentials
  const sipCredentials = await resolveSipCredentials(restaurantId);

  // 6. Build
  const menuText = buildMenuText(categories, items);
  const deliveryText = buildDeliveryText(restaurant);
  const faqText = buildFaqText(faqs);
  const systemPrompt = buildSystemPrompt(
    restaurant,
    menuText,
    deliveryText,
    faqText,
    customerContext
  );

  return {
    systemPrompt,
    tools: buildTools(),
    voice: restaurant.aiVoice || "sage",
    customerContext,
    sipCredentials,
  };
}
