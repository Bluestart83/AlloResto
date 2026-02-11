/**
 * ai-prompt.service.ts
 *
 * Construit le system prompt + tools pour OpenAI Realtime API
 * à partir des données en BDD :
 *   - Menu complet avec prix et options
 *   - Formules / menus composés
 *   - Config livraison (frais, minimum, seuil gratuit)
 *   - Config réservation (places, durée, avance)
 *   - FAQ répondues (base de connaissances)
 *   - Client connu (prénom, adresse, historique)
 *   - SIP credentials (propres au client ou fallback .env)
 *
 * Appelé par le SIP service Python via :
 *   GET /api/ai?restaurantId=xxx&callerPhone=0612345678
 */

import { getDb } from "@/lib/db";
import { Restaurant } from "@/db/entities/Restaurant";
import { PhoneLine } from "@/db/entities/PhoneLine";
import { decryptSipPassword, isEncrypted } from "@/services/sip-encryption.service";
import { MenuCategory } from "@/db/entities/MenuCategory";
import { MenuItem } from "@/db/entities/MenuItem";
import { Customer } from "@/db/entities/Customer";
import { Faq } from "@/db/entities/Faq";
import { DiningService } from "@/db/entities/DiningService";
import { Offer } from "@/db/entities/Offer";
import { PricingConfig } from "@/db/entities/PricingConfig";
import { getExchangeRate } from "@/services/exchange-rate.service";

// ============================================================
// TYPES
// ============================================================

export interface AiSessionConfig {
  systemPrompt: string;
  tools: Tool[];
  voice: string;
  avgPrepTimeMin: number;
  deliveryEnabled: boolean;
  reservationEnabled: boolean;
  customerContext: CustomerContext | null;
  sipCredentials: SipCredentials;
  /** Mapping index entier → {id: UUID, name: string} (items + formules) */
  itemMap: Record<number, { id: string; name: string }>;
  transferEnabled: boolean;
  transferPhoneNumber: string | null;
  transferAutomatic: boolean;
  /** Effective AI cost margin % for this restaurant */
  aiCostMarginPct: number;
  /** Restaurant currency (EUR, USD, etc.) */
  currency: string;
  /** Exchange rate from USD to restaurant currency (e.g. 0.92 for EUR) */
  exchangeRateToLocal: number;
  /** Restaurant timezone (e.g. "Europe/Paris") */
  timezone: string;
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
// BUILD MENU TEXT (articles à la carte)
// ============================================================

function buildMenuText(
  categories: MenuCategory[],
  items: MenuItem[],
  itemMap: Record<number, { id: string; name: string }>,
  counter: { value: number },
): string {
  const lines: string[] = ["CARTE / ARTICLES DISPONIBLES :", ""];

  for (const cat of categories) {
    const catItems = items.filter(
      (i) => i.categoryId === cat.id && i.isAvailable
    );
    if (catItems.length === 0) continue;

    lines.push(`## ${cat.name}`);

    for (const item of catItems) {
      const idx = counter.value++;
      itemMap[idx] = { id: item.id, name: item.name };

      let line = `- #${idx} ${item.name} : ${Number(item.price).toFixed(2)}€`;
      if (item.description) line += ` — ${item.description}`;

      const options = item.options as any[];
      if (options?.length > 0) {
        for (const opt of options) {
          if (!opt.choices) continue;
          const choices = opt.choices
            .map((c: any) => {
              const extra =
                c.price_modifier > 0
                  ? ` (+${Number(c.price_modifier).toFixed(2)}€)`
                  : "";
              return `${c.label}${extra}`;
            })
            .join(", ");
          line += `\n  ${opt.name} [${opt.required ? "obligatoire" : "optionnel"}] : ${choices}`;
        }
      }

      const allergens = item.allergens as string[];
      if (allergens?.length > 0) {
        line += `\n  Allergenes : ${allergens.join(", ")}`;
      }

      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// BUILD FORMULES TEXT (menus composés, categoryId === null)
// ============================================================

function buildFormulesText(
  categories: MenuCategory[],
  items: MenuItem[],
  itemMap: Record<number, { id: string; name: string }>,
  counter: { value: number },
): string {
  const formules = items.filter((i) => i.categoryId === null && i.isAvailable);
  if (formules.length === 0) return "";

  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Reverse map UUID → index pour référencer les items par #N dans les options
  const uuidToIdx = new Map<string, number>();
  for (const [idx, entry] of Object.entries(itemMap)) {
    uuidToIdx.set(entry.id, Number(idx));
  }

  const lines: string[] = ["FORMULES / MENUS :", ""];

  for (const formule of formules) {
    const idx = counter.value++;
    itemMap[idx] = { id: formule.id, name: formule.name };

    lines.push(`- #${idx} ${formule.name} : ${Number(formule.price).toFixed(2)}€`);
    if (formule.description) lines.push(`  ${formule.description}`);

    const options = formule.options as any[];
    if (options?.length > 0) {
      for (const opt of options) {
        if (opt.source === "category") {
          // Choix parmi une catégorie entière — afficher #N de chaque item
          const cat = catMap.get(opt.categoryId);
          const catItems = items.filter(
            (i) => i.categoryId === opt.categoryId && i.isAvailable
          );
          const refs = catItems.map((i) => {
            const refIdx = uuidToIdx.get(i.id);
            return refIdx !== undefined ? `#${refIdx} ${i.name}` : i.name;
          }).join(", ");
          const maxPriceNote = opt.maxPrice
            ? ` (max ${Number(opt.maxPrice).toFixed(2)}€)`
            : "";
          lines.push(
            `  ${opt.name || cat?.name || "Choix"} [${opt.required !== false ? "obligatoire" : "optionnel"}]${maxPriceNote} : ${refs || "voir carte"}`
          );
        } else if (opt.source === "items") {
          // Choix parmi des items spécifiques — afficher #N
          const refs = (opt.itemIds || [])
            .map((id: string) => {
              const refIdx = uuidToIdx.get(id);
              const item = items.find((i) => i.id === id);
              if (!item) return null;
              return refIdx !== undefined ? `#${refIdx} ${item.name}` : item.name;
            })
            .filter(Boolean)
            .join(", ");
          lines.push(
            `  ${opt.name || "Choix"} [${opt.required !== false ? "obligatoire" : "optionnel"}] : ${refs || "voir carte"}`
          );
        } else if (opt.choices) {
          // Format choices classique (variantes — pas des items, juste des labels)
          const choices = opt.choices
            .map((c: any) => {
              const extra =
                c.price_modifier > 0
                  ? ` (+${Number(c.price_modifier).toFixed(2)}€)`
                  : "";
              return `${c.label}${extra}`;
            })
            .join(", ");
          lines.push(
            `  ${opt.name} [${opt.required ? "obligatoire" : "optionnel"}] : ${choices}`
          );
        }
      }
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
    return "LIVRAISON : Non disponible. Uniquement retrait sur place (a emporter).";
  }

  const lines = [
    "LIVRAISON :",
    `- Rayon : ${restaurant.deliveryRadiusKm} km`,
    `- Commande minimum : ${Number(restaurant.minOrderAmount).toFixed(2)}€`,
  ];

  if (restaurant.deliveryFreeAbove && Number(restaurant.deliveryFreeAbove) > 0) {
    lines.push(
      `- Frais : ${Number(restaurant.deliveryFee).toFixed(2)}€ (GRATUIT au-dessus de ${Number(restaurant.deliveryFreeAbove).toFixed(2)}€)`
    );
  } else if (Number(restaurant.deliveryFee) > 0) {
    lines.push(`- Frais : ${Number(restaurant.deliveryFee).toFixed(2)}€`);
  } else {
    lines.push("- Frais : GRATUIT");
  }

  lines.push(`- Temps de preparation moyen : ${restaurant.avgPrepTimeMin} min`);

  return lines.join("\n");
}

// ============================================================
// BUILD RESERVATION TEXT
// ============================================================

function buildReservationText(restaurant: Restaurant): string {
  if (!restaurant.reservationEnabled) return "";

  return [
    "",
    "RESERVATION DE TABLE :",
    `- Places totales : ${restaurant.totalSeats}`,
    `- Duree moyenne d'un repas : ${restaurant.avgMealDurationMin} min`,
    `- Reservation possible : minimum ${restaurant.minReservationAdvanceMin} min a l'avance, jusqu'a ${restaurant.maxReservationAdvanceDays} jours`,
  ].join("\n");
}

// ============================================================
// BUILD SERVICES TEXT (services de restauration)
// ============================================================

const DAY_NAMES = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function buildServicesText(services: DiningService[]): string {
  const active = services.filter((s) => s.isActive && !s.isPrivate);
  if (active.length === 0) return "";

  const lines = ["", "SERVICES DE RESTAURATION :"];
  for (const svc of active) {
    const days = svc.dayOfWeek.map((d) => DAY_NAMES[d] || `jour${d}`).join(", ");
    let line = `- ${svc.name} : ${days}, ${svc.startTime}–${svc.endTime}`;
    if (svc.lastSeatingTime) line += ` (dernier accueil ${svc.lastSeatingTime})`;
    line += `, ${svc.maxCovers} couverts max, repas ${svc.defaultDurationMin} min`;
    if (svc.requiresPrepayment && svc.prepaymentAmount) {
      line += ` — prepaiement ${Number(svc.prepaymentAmount).toFixed(2)}€`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// ============================================================
// BUILD OFFERS TEXT (offres / promotions)
// ============================================================

function buildOffersText(
  offers: Offer[],
  itemMap: Record<number, { id: string; name: string }>,
): string {
  const active = offers.filter((o) => o.isActive && o.isBookable);
  if (active.length === 0) return "";

  // Reverse map UUID → index
  const uuidToIdx = new Map<string, number>();
  for (const [idx, entry] of Object.entries(itemMap)) {
    uuidToIdx.set(entry.id, Number(idx));
  }

  const lines = ["", "OFFRES DISPONIBLES :"];
  for (const offer of active) {
    let line = `- ${offer.name}`;
    if (offer.description) line += ` — ${offer.description}`;
    if (offer.type !== "menu") line += ` [${offer.type}]`;
    if (offer.discountPercent) line += ` (-${offer.discountPercent}%)`;
    if (offer.menuItemId) {
      const idx = uuidToIdx.get(offer.menuItemId);
      if (idx !== undefined) line += ` (formule #${idx})`;
    }
    if (offer.minPartySize || offer.maxPartySize) {
      line += ` · ${offer.minPartySize || 1}–${offer.maxPartySize || "∞"} pers.`;
    }
    if (!offer.isPermanent && offer.startDate) {
      line += ` · du ${offer.startDate} au ${offer.endDate || "..."}`;
    }
    if (offer.hasPrepayment && offer.prepaymentAmount) {
      line += ` · prepaiement ${Number(offer.prepaymentAmount).toFixed(2)}€${offer.prepaymentType === "per_person" ? "/pers." : ""}`;
    }
    lines.push(line);
  }
  lines.push("");
  lines.push("→ Propose les offres au client lorsqu'il reserve, si elles correspondent a sa situation (taille du groupe, date).");
  return lines.join("\n");
}

// ============================================================
// BUILD FAQ TEXT (base de connaissances)
// ============================================================

function buildFaqText(faqs: Faq[]): string {
  const lines = [
    "",
    "BASE DE CONNAISSANCES (FAQ) :",
  ];

  if (faqs.length > 0) {
    lines.push(
      "Voici les questions frequentes. Si le client pose une de ces questions, reponds DIRECTEMENT avec la reponse fournie.",
      ""
    );
    for (const faq of faqs) {
      lines.push(`Q: ${faq.question}`);
      lines.push(`R: ${faq.answer}`);
      lines.push("");
    }
  } else {
    lines.push("Aucune FAQ enregistree pour le moment.", "");
  }

  lines.push(
    "IMPORTANT — Questions non couvertes par la FAQ :",
    "- Si le client pose une question dont la reponse N'EST PAS dans la FAQ ci-dessus",
    "  et que tu ne connais PAS la reponse de facon certaine :",
    '  1. Appelle log_new_faq avec la question reformulee et la categorie appropriee',
    '  2. Dis au client : "Je n\'ai pas cette information, je remonte votre question au restaurant."',
    "- NE PAS inventer de reponse. NE PAS deviner les horaires, les prix, ou les services non mentionnes.",
    "- Les categories disponibles : horaires, livraison, allergens, paiement, parking, reservation, promotion, ingredients, other"
  );

  return lines.join("\n");
}

// ============================================================
// BUILD SYSTEM PROMPT — Prompt structuré prise de commande
// ============================================================

function buildSystemPrompt(
  restaurant: Restaurant,
  menuText: string,
  formulesText: string,
  deliveryText: string,
  servicesText: string,
  offersText: string,
  faqText: string,
  customer: CustomerContext | null
): string {
  // Heure actuelle dans la timezone du restaurant
  const tz = restaurant.timezone || "Europe/Paris";
  const now = new Date();
  const localTime = now.toLocaleString("fr-FR", {
    timeZone: tz,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const localHHMM = now.toLocaleString("fr-FR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const localDate = now.toLocaleDateString("fr-FR", {
    timeZone: tz,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Horaires lisibles
  const hoursText =
    (restaurant.openingHoursText || []).length > 0
      ? restaurant.openingHoursText.join("\n")
      : JSON.stringify(restaurant.openingHours, null, 2);

  // Section client
  const customerFullAddress = customer?.deliveryAddress
    ? `${customer.deliveryAddress}, ${customer.deliveryPostalCode || ""} ${customer.deliveryCity || ""}`.trim()
    : "";
  const customerSection = customer
    ? [
        "CLIENT IDENTIFIE :",
        `- Prenom : ${customer.firstName || "inconnu"}`,
        `- Telephone : ${customer.phone}`,
        `- Commandes precedentes : ${customer.totalOrders}`,
        `- Total depense : ${customer.totalSpent.toFixed(2)}€`,
        customerFullAddress
          ? `- Adresse de livraison enregistree : ${customerFullAddress}`
          : "- Pas d'adresse de livraison enregistree",
        customer.deliveryNotes
          ? `- Notes de livraison : ${customer.deliveryNotes}`
          : "",
        "",
        `→ Accueille-le par son prenom.`,
        customerFullAddress
          ? `→ Si livraison, utilise DIRECTEMENT l'adresse enregistree : propose "On livre au ${customerFullAddress} ?" — ne redemande PAS l'adresse. Si le client donne une nouvelle adresse, appelle save_customer_info.`
          : `→ Si livraison, demande l'adresse complete puis appelle save_customer_info pour l'enregistrer.`,
      ]
        .filter(Boolean)
        .join("\n")
    : "NOUVEAU CLIENT : Demande son prenom. Si livraison, demande l'adresse complete (rue, code postal, ville) puis appelle save_customer_info.";

  // Info frais de livraison pour les règles
  let deliveryFeeRule = "";
  if (restaurant.deliveryEnabled) {
    if (restaurant.deliveryFreeAbove && Number(restaurant.deliveryFreeAbove) > 0) {
      deliveryFeeRule = `Les frais de livraison sont de ${Number(restaurant.deliveryFee).toFixed(2)}€, GRATUITS au-dessus de ${Number(restaurant.deliveryFreeAbove).toFixed(2)}€.`;
    } else if (Number(restaurant.deliveryFee) > 0) {
      deliveryFeeRule = `Les frais de livraison sont de ${Number(restaurant.deliveryFee).toFixed(2)}€.`;
    } else {
      deliveryFeeRule = "La livraison est GRATUITE.";
    }
  }

  // Modes disponibles
  const modes: string[] = [];
  modes.push("sur place (a emporter)");
  if (restaurant.deliveryEnabled) modes.push("en livraison");
  if (restaurant.reservationEnabled) modes.push("reserver une table");
  const modesText = modes.join(", ");

  const reservationText = buildReservationText(restaurant);

  // Règles de logique dynamiques
  let ruleNumber = 1;
  const rules: string[] = [];

  rules.push(`${ruleNumber}. DEMANDER LE MODE (OBLIGATOIRE) :
   - AVANT de prendre la moindre commande, tu DOIS connaitre le mode : ${restaurant.deliveryEnabled ? "a emporter ou en livraison" : "a emporter"}${restaurant.reservationEnabled ? " (ou reservation)" : ""}.
   - Si le client commence a commander directement sans preciser le mode, INTERROMPS-LE poliment :
     "Bien sur ! C'est pour ${restaurant.deliveryEnabled ? "emporter ou en livraison" : "emporter"} ?"
   - Ne note AUCUN article tant que le mode n'est pas confirme.
   - Verbatim : "Que souhaitez-vous ? Commander ${restaurant.deliveryEnabled ? "a emporter, en livraison" : "a emporter"}${restaurant.reservationEnabled ? ", ou reserver une table" : ""} ?"
   → Selon la reponse, suivre le flow correspondant.`);
  ruleNumber++;

  rules.push(`${ruleNumber}. PRISE DE COMMANDE (AVANT check_availability) :
   - Quand le client dit "a emporter" ou "en livraison", ca veut dire qu'il veut COMMANDER, pas qu'il a fini.
   - Tu dois d'abord lui demander CE QU'IL VEUT COMMANDER. Propose la carte si besoin.
   - NE PAS appeler check_availability tant que le client n'a pas choisi au moins un article.
   - NE JAMAIS appeler confirm_order avec une liste d'articles vide.
   - Si le client dit "c'est tout" ou "ce sera tout", alors seulement proceder a la verification et confirmation.
   - Si le client ne veut finalement rien commander (il annule), ne pas confirmer — proposer de laisser un message ou dire au revoir.`);
  ruleNumber++;

  rules.push(`${ruleNumber}. VERIFICATION OBLIGATOIRE — check_availability :
   Tu DOIS appeler check_availability AVANT de confirmer quoi que ce soit.
   - Mode "pickup" : appeler avec mode="pickup". Tu recevras estimatedTime (HH:MM).
   - Mode "delivery" : ${customerFullAddress
      ? `tu connais deja l'adresse du client ("${customerFullAddress}"). Propose-la et demande confirmation. Si le client confirme, utilise cette adresse. Si le client donne une nouvelle adresse, utilise la nouvelle et appelle save_customer_info pour la sauvegarder.`
      : `demander l'adresse complete (rue, ville, code postal), puis appeler save_customer_info pour l'enregistrer.`}
     Appeler check_availability avec mode="delivery" + adresse.
     Si available=false → proposer le retrait sur place.
     ${restaurant.deliveryEnabled ? `Si le total est inferieur a ${Number(restaurant.minOrderAmount).toFixed(2)}€ → refuser la livraison.` : ""}
     ${deliveryFeeRule}
   ${restaurant.reservationEnabled ? `- Mode "reservation" : demander nombre de personnes + heure souhaitee, puis appeler avec mode="reservation" + party_size + requested_time.
     Si available=false → proposer un autre creneau.` : ""}
   - Si le client veut une heure specifique, passe requested_time (HH:MM).
   - Le tool retourne estimatedTime (HH:MM) → c'est cette heure que tu annonces au client.
   - Si le client veut plus tot que estimatedTime, dis que ce n'est pas possible.`);
  ruleNumber++;

  if (restaurant.deliveryEnabled) {
    rules.push(`${ruleNumber}. LIVRAISON :
   a. ${customerFullAddress
      ? `L'adresse de livraison est connue : "${customerFullAddress}". Propose-la au client ("On livre au ${customerFullAddress} ?"). Si le client confirme → utiliser directement. Si le client donne une nouvelle adresse → utiliser la nouvelle.`
      : `Demander l'adresse complete (rue, ville, code postal).`}
   b. Appeler check_availability(mode="delivery", ...) → tu recevras estimatedTime et deliveryFee
   c. Annoncer les frais de livraison AVANT la confirmation
   d. Annoncer l'heure de livraison retournee par check_availability
   e. IMPORTANT : apres une livraison, si l'adresse est nouvelle ou n'etait pas enregistree, appeler save_customer_info avec delivery_address, delivery_city, delivery_postal_code (et delivery_notes si le client donne des instructions).`);
    ruleNumber++;
  }

  rules.push(`${ruleNumber}. GESTION DU MENU :
   - Si un article n'est pas au menu, dis-le poliment et propose une alternative
   - Propose les formules si elles sont avantageuses pour le client
   - Pour les formules, demande chaque choix obligatoire un par un`);
  ruleNumber++;

  rules.push(`${ruleNumber}. RECAPITULATION (avant confirm_order) :
   - Reformuler la commande complete a voix haute
   - Annoncer le total TTC (articles + frais de livraison si applicable)
   - Annoncer l'heure de retrait / livraison (celle retournee par check_availability)
   - Obtenir la confirmation explicite du client`);
  ruleNumber++;

  if (restaurant.reservationEnabled) {
    rules.push(`${ruleNumber}. RESERVATION DE TABLE :
   a. Demander le nombre de personnes et l'heure souhaitee
   b. Demander s'il a une preference de placement (fenetre, exterieur, grande table, coin calme, bar)
   c. Appeler check_availability(mode="reservation", party_size=N, requested_time="HH:MM", seating_preference=...)
   d. Si available=true → annoncer l'heure confirmee et le nombre de places
   e. Si available=false → expliquer la raison et proposer un autre creneau
   f. S'il y a des OFFRES DISPONIBLES qui correspondent (taille du groupe, date), les proposer au client
   g. Obtenir la confirmation du client
   h. Si le client a des demandes speciales (anniversaire, chaise bebe, etc.), les noter
   i. Appeler confirm_reservation avec les infos + service_id (retourne par check_availability) + offer_id (si le client a choisi une offre). IMPORTANT: resume les notes du client de facon claire et concise dans le champ "notes".`);
    ruleNumber++;
  }

  if (restaurant.orderStatusEnabled) {
    rules.push(`${ruleNumber}. SUIVI DE COMMANDE :
   - Si le client demande ou en est sa commande, si c'est bientot pret, etc. : appeler check_order_status avec son numero de telephone.
   - Traduire le statut en francais naturel :
     pending = "en attente de validation", confirmed = "confirmee", preparing = "en cours de preparation",
     ready = "prete ! Vous pouvez venir la recuperer", delivering = "en cours de livraison",
     completed = "deja livree / recuperee", cancelled = "annulee"
   - Si une heure estimee est disponible, l'annoncer.
   - Si aucune commande trouvee, dire poliment qu'aucune commande recente n'a ete trouvee pour ce numero.`);
    ruleNumber++;

    rules.push(`${ruleNumber}. ANNULATION DE COMMANDE :
   - NE PAS proposer cette option au debut de l'appel. Reagir uniquement si le client demande a annuler.
   - D'abord appeler check_order_status pour retrouver la commande.
   - Si la commande est en statut "pending" ou "confirmed" : confirmer avec le client puis appeler cancel_order.
   - Si la commande est deja en "preparing", "ready", "delivering" ou "completed" : expliquer que l'annulation n'est plus possible a ce stade.
   - TOUJOURS obtenir la confirmation explicite du client avant d'annuler.`);
    ruleNumber++;
  }

  if (restaurant.reservationEnabled) {
    rules.push(`${ruleNumber}. ANNULATION DE RESERVATION :
   - NE PAS proposer cette option au debut de l'appel. Reagir uniquement si le client demande a annuler.
   - Appeler lookup_reservation avec le numero de telephone pour retrouver la reservation.
   - Annoncer les details (date, heure, nombre de personnes) pour confirmer avec le client.
   - Obtenir la confirmation explicite du client avant d'annuler.
   - Appeler cancel_reservation avec l'id de la reservation.`);
    ruleNumber++;
  }

  rules.push(`${ruleNumber}. MESSAGES ET DEMANDES SPECIALES :
   - Si le client veut laisser un message, etre rappele, a une reclamation ou une demande speciale : utiliser leave_message
   - Resume le message de facon claire et concise
   - Si le client ne passe ni commande ni reservation, propose-lui de laisser un message avant de raccrocher`);
  ruleNumber++;

  if (restaurant.transferEnabled && restaurant.transferPhoneNumber && !restaurant.transferAutomatic) {
    const casesText = restaurant.transferCases
      ? restaurant.transferCases.split("\n").filter((l: string) => l.trim()).map((l: string) => `     * ${l.trim()}`).join("\n")
      : "     * Le client insiste pour parler a un humain";
    rules.push(`${ruleNumber}. TRANSFERT D'APPEL :
   - Tu peux transferer l'appel vers un humain du restaurant dans les cas suivants :
${casesText}
   - Avant de transferer, previens TOUJOURS le client : "Je vais vous passer un de mes collegues, ne quittez pas."
   - Appelle transfer_call avec la raison du transfert.
   - Ne JAMAIS proposer le transfert en premier — d'abord essayer de repondre toi-meme.`);
    ruleNumber++;
  }

  rules.push(`${ruleNumber}. FIN D'APPEL :
   - Apres une commande confirmee ou une reservation, TOUJOURS demander "Est-ce que je peux faire autre chose pour vous ?" ou "Autre chose ?" AVANT de dire au revoir.
   - Quand la conversation est vraiment terminee (le client confirme qu'il n'a plus besoin de rien, ou veut raccrocher) :
     1. Tu DOIS dire au revoir a voix haute DANS LA MEME REPONSE que end_call (ex: "Merci et a bientot chez ${restaurant.name} !")
     2. Puis appelle end_call dans cette meme reponse.
   - INTERDIT d'appeler end_call sans avoir dit au revoir a voix haute juste avant dans la meme reponse. Meme si le client dit "au revoir", tu DOIS repondre vocalement avant d'appeler end_call.
   - TOUJOURS appeler end_call pour raccrocher. Ne jamais laisser l'appel ouvert.
   - Ne genere AUCUN texte APRES end_call — c'est end_call qui raccroche la ligne.`);
  ruleNumber++;

  // Verbatim réservation
  const reservationVerbatim = restaurant.reservationEnabled
    ? `
Reservation - nombre de personnes :
"Pour combien de personnes souhaitez-vous reserver ?"

Reservation - heure :
"A quelle heure souhaitez-vous venir ?"

Reservation - preference placement :
"Avez-vous une preference ? Pres de la fenetre, en exterieur, une grande table ?"

Reservation - confirmation :
"Parfait, je vous reserve une table pour [N] personnes a [heure]${restaurant.reservationEnabled ? "[, pres de la fenetre / en exterieur / ...]" : ""}. C'est bien ca ?"

Reservation - indisponible :
"Malheureusement, nous n'avons plus de place a ce creneau. Souhaitez-vous un autre horaire ?"

Message :
"Tres bien, je transmets votre message au restaurant. [resume]. Autre chose ?"`
    : "";

  return `ROLE :
Tu es l'agent vocal (IA) de prise de commande telephonique de "${restaurant.name}" (${restaurant.cuisineType || "restaurant"}).
Tu N'AS PAS de prenom. Tu es l'IA du restaurant. Ne te presente JAMAIS sous le prenom du client.
${restaurant.aiInstructions || "Ton objectif : prendre une commande claire et complete, ou gerer une reservation de table, en validant explicitement l'heure avec le client."}

STYLE VOCAL :
- Parle en francais naturel, comme un vrai employe au telephone.
- Phrases courtes et directes (le client ecoute, il ne lit pas).
- Pas de listes a puces a l'oral, reformule naturellement.
- Confirme chaque article ajoute : "Parfait, une Margherita a 9 euros, c'est note !"
- Recapitule naturellement : "Alors on a une Margherita et deux Cocas, ca fait 13 euros 50."

INFORMATIONS RESTAURANT :
- Nom : ${restaurant.name}
- Type : ${restaurant.cuisineType || "autre"}
- Adresse : ${restaurant.address || ""}${restaurant.postalCode ? `, ${restaurant.postalCode}` : ""} ${restaurant.city || ""}
- Telephone : ${restaurant.phone || "non communique"}
- Services disponibles : ${modesText}

DATE ET HEURE : ${localDate}, ${localTime} (${localHHMM}) — timezone ${tz}
DEVISE : ${restaurant.currency || "EUR"}

HORAIRES :
${hoursText}

${menuText}
${formulesText}
${deliveryText}
${reservationText}
${servicesText}
${offersText}

${customerSection}
${faqText}

========================================
REGLES DE LOGIQUE (OBLIGATOIRES)
========================================

${rules.join("\n\n")}

========================================
VERBATIM A UTILISER
========================================

Accueil :
${customer?.firstName
    ? `"Bonjour ${customer.firstName} ! Ici ${restaurant.name}, que puis-je faire pour vous ?"`
    : `"Bonjour ! Ici ${restaurant.name}, a votre ecoute !"`}

Mode :
"Que souhaitez-vous ? Commander ${restaurant.deliveryEnabled ? "a emporter, en livraison" : "a emporter"}${restaurant.reservationEnabled ? ", ou reserver une table" : ""} ?"

${customerFullAddress
    ? `Livraison (adresse connue) :
"On livre au ${customerFullAddress}, c'est bien ca ?"

Livraison (nouvelle adresse) :
"Vous souhaitez changer d'adresse ? Donnez-moi la nouvelle adresse, s'il vous plait."`
    : `Livraison (demander adresse) :
"A quelle adresse souhaitez-vous etre livre ? La rue, la ville et le code postal, s'il vous plait."`}

Validation horaire (livraison) :
"Votre commande pourrait etre livree vers [estimatedTime]. Ca vous convient ?"

Validation horaire (retrait) :
"Votre commande sera prete vers [estimatedTime]. Ca vous convient ?"
${reservationVerbatim}

Recap :
"Alors je recapitule : [commande]. Le total fait [total] euros${restaurant.deliveryEnabled ? " [dont X euros de livraison si applicable]" : ""}. C'est bien ca ?"

========================================
FONCTIONS DISPONIBLES
========================================

- check_availability : OBLIGATOIRE avant toute confirmation. Modes : pickup, delivery, reservation.
  Retourne available, estimatedTime (HH:MM), et infos supplementaires selon le mode.
  Pour reservation : ajouter seating_preference si le client a une preference de placement.
  Retourne aussi serviceId et serviceName si un service correspond au creneau.
- confirm_order : commande confirmee par le client → l'heure vient du dernier check_availability
${restaurant.reservationEnabled ? "- confirm_reservation : reserver une table confirmee par le client. Inclure seating_preference, service_id (du check_availability), offer_id (si offre choisie), et notes resumees.\n" : ""}- save_customer_info : sauvegarder prenom / adresse (appeler des que le client donne ces infos)
- log_new_faq : remonter une question ABSENTE de la FAQ (dire au client "je n'ai pas cette info")
- leave_message : laisser un message pour le restaurant (rappel, reclamation, demande speciale)
${restaurant.orderStatusEnabled ? "- check_order_status : rechercher les commandes recentes du client par telephone (suivi de commande)\n- cancel_order : annuler une commande (uniquement si pending ou confirmed, apres confirmation du client)\n" : ""}${restaurant.reservationEnabled ? "- lookup_reservation : rechercher les reservations du client par telephone\n- cancel_reservation : annuler une reservation (apres confirmation du client)\n" : ""}${restaurant.transferEnabled && restaurant.transferPhoneNumber && !restaurant.transferAutomatic ? "- transfer_call : transferer l'appel vers un humain (prevenir le client d'abord)\n" : ""}
========================================
CONTROLES AVANT CLOTURE
========================================

Avant d'appeler confirm_order, VERIFIE que TOUS ces points sont valides :
- Mode (retrait / livraison / sur place) confirme
- check_availability appele et available=true
- Si livraison : adresse verifiee, zone OK, frais annonces
- Commande recapitulee a voix haute
- Total annonce (articles + livraison)
- Heure annoncee (celle retournee par check_availability) et validee par le client
- Confirmation explicite du client ("Oui c'est bon" / "Parfait" / "C'est tout")
${restaurant.reservationEnabled ? `
Avant d'appeler confirm_reservation :
- check_availability(mode="reservation") appele et available=true
- Nombre de personnes et heure confirmes par le client
- Nom et telephone du client obtenus
- Si preference de placement demandee, l'inclure
- Notes resumees clairement (anniversaire, allergies, chaise bebe, etc.)` : ""}

Si le client ne commande pas et ne reserve pas :
- Proposer de laisser un message : "Souhaitez-vous laisser un message pour le restaurant ?"
- Si oui, utiliser leave_message avec un resume clair du message`;
}

// ============================================================
// TOOLS (OpenAI function calling)
// ============================================================

function buildTools(restaurant: Restaurant): Tool[] {
  const tools: Tool[] = [
    {
      type: "function",
      name: "check_availability",
      description:
        "Verifie la disponibilite selon le mode (pickup, delivery, reservation). OBLIGATOIRE avant confirm_order ou confirm_reservation. Retourne : available, estimatedTime (HH:MM), estimatedTimeISO. Pour delivery : aussi deliveryDistanceKm, deliveryDurationMin, deliveryFee, customerAddressFormatted. Pour reservation : aussi seatsAvailable.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["pickup", "delivery", "reservation"],
            description: "Mode : retrait sur place, livraison, ou reservation de table",
          },
          requested_time: {
            type: "string",
            description: "Heure souhaitee par le client (format HH:MM). Optionnel : si absent, calcule le plus tot possible.",
          },
          customer_address: {
            type: "string",
            description: "Adresse du client (rue + numero). Obligatoire si mode=delivery.",
          },
          customer_city: {
            type: "string",
            description: "Ville du client",
          },
          customer_postal_code: {
            type: "string",
            description: "Code postal du client",
          },
          party_size: {
            type: "integer",
            description: "Nombre de personnes. Obligatoire si mode=reservation.",
          },
          seating_preference: {
            type: "string",
            enum: ["window", "outdoor", "large_table", "quiet", "bar"],
            description: "Preference de placement du client (fenetre, exterieur, grande table, coin calme, bar). Optionnel.",
          },
        },
        required: ["mode"],
      },
    },
    {
      type: "function",
      name: "confirm_order",
      description:
        "Confirme et enregistre la commande. L'heure estimee vient du dernier check_availability (stocke automatiquement). Appeler UNIQUEMENT apres : check_availability OK, commande recapitulee, total annonce, heure annoncee, confirmation explicite du client.",
      parameters: {
        type: "object",
        properties: {
          order_type: {
            type: "string",
            enum: ["pickup", "delivery", "dine_in"],
            description: "Mode de la commande",
          },
          items: {
            type: "array",
            description: "Articles commandes. Utilise le #id du menu pour chaque article.",
            items: {
              type: "object",
              properties: {
                id: { type: "integer", description: "Numero #id de l'article ou formule (ex: 3 pour #3)" },
                quantity: { type: "integer", description: "Quantite" },
                unit_price: { type: "number", description: "Prix unitaire en euros" },
                selected_options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Nom de l'option (ex: Taille, Entree, Plat)" },
                      choice_id: { type: "integer", description: "Numero #id du choix (pour les formules, ex: #2 pour Salade Cesar)" },
                      choice: { type: "string", description: "Label du choix (pour les variantes simples, ex: Grande)" },
                      extra_price: { type: "number", description: "Supplement en euros" },
                    },
                  },
                  description: "Options choisies. Pour les formules : utiliser choice_id (#id). Pour les variantes simples (taille, sauce) : utiliser choice (label).",
                },
                notes: {
                  type: "string",
                  description: "Remarques (sans oignons, bien cuit...)",
                },
              },
              required: ["id", "quantity", "unit_price"],
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
          payment_method: {
            type: "string",
            enum: ["cash", "card", "online"],
            description: "Mode de paiement choisi",
          },
          notes: { type: "string", description: "Notes generales sur la commande" },
        },
        required: ["order_type", "items", "total"],
      },
    },
    {
      type: "function",
      name: "save_customer_info",
      description:
        "Sauvegarde le prenom ou une nouvelle adresse du client. Appeler des que le client donne son prenom ou une adresse.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "Prenom du client" },
          delivery_address: { type: "string", description: "Adresse de livraison" },
          delivery_city: { type: "string", description: "Ville" },
          delivery_postal_code: { type: "string", description: "Code postal" },
          delivery_notes: {
            type: "string",
            description: "Instructions (code porte, etage, batiment...)",
          },
        },
      },
    },
    {
      type: "function",
      name: "log_new_faq",
      description:
        "Remonte une question du client ABSENTE de la FAQ et dont tu ne connais PAS la reponse. Ne PAS appeler si la FAQ contient deja la reponse.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "La question posee par le client, reformulee clairement",
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
              "localisation",
              "info_restau",
              "other",
            ],
            description: "Categorie de la question",
          },
        },
        required: ["question", "category"],
      },
    },
    {
      type: "function",
      name: "leave_message",
      description:
        "Laisse un message pour le restaurant. Utiliser quand : (1) le client demande explicitement de laisser un message, (2) le client a une demande speciale a transmettre, (3) le client veut etre rappele, (4) le client a une reclamation. Resume le message de facon claire et concise.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Resume clair et concis du message a transmettre au restaurant",
          },
          caller_name: {
            type: "string",
            description: "Nom de la personne qui laisse le message",
          },
          category: {
            type: "string",
            enum: ["callback_request", "complaint", "info_request", "special_request", "other"],
            description: "Categorie : demande de rappel, reclamation, demande d'info, demande speciale, autre",
          },
          is_urgent: {
            type: "boolean",
            description: "True si le message est urgent (reclamation grave, probleme de sante...)",
          },
        },
        required: ["content", "category"],
      },
    },
  ];

  // Ajouter confirm_reservation si activé
  if (restaurant.reservationEnabled) {
    tools.push({
      type: "function",
      name: "confirm_reservation",
      description:
        "Confirme et enregistre une reservation de table. Appeler UNIQUEMENT apres : check_availability(mode='reservation') OK, nombre de personnes et heure confirmes, nom et telephone du client obtenus. Si une offre correspond, inclure offer_id. Le service_id est retourne par check_availability.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Nom du client pour la reservation",
          },
          customer_phone: {
            type: "string",
            description: "Telephone du client",
          },
          party_size: {
            type: "integer",
            description: "Nombre de personnes",
          },
          reservation_time: {
            type: "string",
            description: "Heure de la reservation (format HH:MM), celle confirmee par check_availability",
          },
          seating_preference: {
            type: "string",
            enum: ["window", "outdoor", "large_table", "quiet", "bar"],
            description: "Preference de placement : fenetre, exterieur, grande table, coin calme, bar",
          },
          service_id: {
            type: "string",
            description: "ID du service (retourne par check_availability). Optionnel.",
          },
          offer_id: {
            type: "string",
            description: "ID de l'offre choisie par le client (voir liste OFFRES DISPONIBLES). Optionnel.",
          },
          notes: {
            type: "string",
            description: "Notes resumees (anniversaire, chaise bebe, allergies...)",
          },
        },
        required: ["customer_name", "customer_phone", "party_size", "reservation_time"],
      },
    });
  }

  // Ajouter check_order_status + cancel_order si activé
  if (restaurant.orderStatusEnabled) {
    tools.push({
      type: "function",
      name: "check_order_status",
      description:
        "Recherche les commandes recentes du client (dernières 24h) par son numero de telephone. Utiliser quand le client demande ou est sa commande, si c'est bientot pret, etc. Retourne le statut, le contenu et l'heure estimee.",
      parameters: {
        type: "object",
        properties: {
          customer_phone: {
            type: "string",
            description: "Numero de telephone du client (celui de l'appel en cours)",
          },
        },
        required: ["customer_phone"],
      },
    });

    tools.push({
      type: "function",
      name: "cancel_order",
      description:
        "Annule une commande. Uniquement possible si la commande est en statut 'pending' ou 'confirmed'. Appeler UNIQUEMENT apres avoir retrouve la commande via check_order_status ET obtenu la confirmation explicite du client.",
      parameters: {
        type: "object",
        properties: {
          order_number: {
            type: "integer",
            description: "Numero de la commande a annuler (retourne par check_order_status)",
          },
        },
        required: ["order_number"],
      },
    });
  }

  // Ajouter lookup_reservation + cancel_reservation si réservations activées
  if (restaurant.reservationEnabled) {
    tools.push({
      type: "function",
      name: "lookup_reservation",
      description:
        "Recherche les reservations a venir du client par son numero de telephone. Utiliser quand le client veut annuler ou modifier une reservation.",
      parameters: {
        type: "object",
        properties: {
          customer_phone: {
            type: "string",
            description: "Numero de telephone du client (celui de l'appel en cours)",
          },
        },
        required: ["customer_phone"],
      },
    });

    tools.push({
      type: "function",
      name: "cancel_reservation",
      description:
        "Annule une reservation. Appeler UNIQUEMENT apres avoir retrouve la reservation via lookup_reservation ET obtenu la confirmation explicite du client.",
      parameters: {
        type: "object",
        properties: {
          reservation_id: {
            type: "string",
            description: "ID de la reservation a annuler (retourne par lookup_reservation)",
          },
        },
        required: ["reservation_id"],
      },
    });
  }

  // Tool transfer_call — si transfert activé (et pas automatique)
  if (restaurant.transferEnabled && restaurant.transferPhoneNumber && !restaurant.transferAutomatic) {
    tools.push({
      type: "function",
      name: "transfer_call",
      description:
        "Transfere l'appel vers un humain du restaurant. Previens TOUJOURS le client avant de transferer (ex: 'Je vais vous passer un collegue, ne quittez pas.'). Apres le transfert, l'appel IA se termine.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Raison du transfert (pour le log)",
          },
        },
        required: ["reason"],
      },
    });
  }

  // Tool end_call — toujours disponible
  tools.push({
    type: "function",
    name: "end_call",
    description:
      "Raccroche l'appel. Appeler APRES avoir dit au revoir au client, une fois que la conversation est terminee (commande confirmee, reservation faite, message laisse, ou le client veut raccrocher).",
    parameters: {
      type: "object",
      properties: {},
    },
  });

  return tools;
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

  if (phoneLine?.sipDomain && phoneLine?.sipUsername && phoneLine?.sipPassword) {
    const rawPassword = phoneLine.sipPassword;
    const password = isEncrypted(rawPassword)
      ? decryptSipPassword(rawPassword, phoneLine.id)
      : rawPassword;

    return {
      domain: phoneLine.sipDomain,
      username: phoneLine.sipUsername,
      password,
      source: "client",
    };
  }

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

  // 2. Menu (catégories + tous les items, y compris formules)
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

  // 5b. Services + Offres
  const diningServices = await ds.getRepository(DiningService).find({
    where: { restaurantId, isActive: true },
    order: { displayOrder: "ASC" },
  });

  const activeOffers = await ds.getRepository(Offer).find({
    where: { restaurantId, isActive: true },
  });

  // 5c. Effective AI cost margin: restaurant override or global default
  let aiCostMarginPct = 30; // ultimate fallback
  if (restaurant.aiCostMarginPct != null) {
    aiCostMarginPct = Number(restaurant.aiCostMarginPct);
  } else {
    const pricingConfig = await ds.getRepository(PricingConfig).findOne({ where: {} });
    if (pricingConfig) {
      aiCostMarginPct = Number(pricingConfig.defaultMarginPct);
    }
  }

  // 5d. Currency & exchange rate (USD → restaurant currency)
  const currency = restaurant.currency || "EUR";
  const exchangeRateToLocal = await getExchangeRate(currency);

  // 6. Build prompt sections + itemMap
  const itemMap: Record<number, { id: string; name: string }> = {};
  const counter = { value: 1 };

  const menuText = buildMenuText(categories, items, itemMap, counter);
  const formulesText = buildFormulesText(categories, items, itemMap, counter);
  const deliveryText = buildDeliveryText(restaurant);
  const servicesText = buildServicesText(diningServices);
  const offersText = buildOffersText(activeOffers, itemMap);
  const faqText = buildFaqText(faqs);

  const systemPrompt = buildSystemPrompt(
    restaurant,
    menuText,
    formulesText,
    deliveryText,
    servicesText,
    offersText,
    faqText,
    customerContext
  );

  return {
    systemPrompt,
    tools: buildTools(restaurant),
    voice: restaurant.aiVoice || "sage",
    avgPrepTimeMin: restaurant.avgPrepTimeMin,
    deliveryEnabled: restaurant.deliveryEnabled,
    reservationEnabled: restaurant.reservationEnabled,
    customerContext,
    sipCredentials,
    itemMap,
    transferEnabled: restaurant.transferEnabled,
    transferPhoneNumber: restaurant.transferPhoneNumber,
    transferAutomatic: restaurant.transferAutomatic,
    aiCostMarginPct,
    currency,
    exchangeRateToLocal,
    timezone: restaurant.timezone || "Europe/Paris",
  };
}
