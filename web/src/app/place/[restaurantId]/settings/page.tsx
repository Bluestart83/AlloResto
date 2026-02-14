"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { isValidE164, formatPhoneDisplay } from "@/lib/format-phone";
import {
  type PlanningConfig,
  type OrderSize,
  type Resource,
  DEFAULT_PLANNING_CONFIG,
  RESOURCE_LABELS,
} from "@/types/planning";

const SYNC_PLATFORMS: {
  value: string;
  label: string;
  implemented: boolean;
  webhookAuth: "hmac" | "bearer" | "none";
  credentialFields: { key: string; label: string; type?: string }[];
}[] = [
  { value: "zenchef", label: "Zenchef", implemented: true, webhookAuth: "hmac", credentialFields: [{ key: "apiKey", label: "API Key" }, { key: "restaurantUid", label: "Restaurant UID" }] },
  { value: "thefork", label: "TheFork", implemented: false, webhookAuth: "bearer", credentialFields: [{ key: "apiKey", label: "API Key" }, { key: "restaurantId", label: "Restaurant ID" }] },
  { value: "resengo", label: "Resengo", implemented: false, webhookAuth: "bearer", credentialFields: [{ key: "apiKey", label: "API Key" }, { key: "venueId", label: "Venue ID" }] },
  { value: "sevenrooms", label: "SevenRooms", implemented: false, webhookAuth: "hmac", credentialFields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client Secret", type: "password" }, { key: "venueId", label: "Venue ID" }] },
  { value: "opentable", label: "OpenTable", implemented: false, webhookAuth: "hmac", credentialFields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client Secret", type: "password" }, { key: "rid", label: "Restaurant ID (RID)" }] },
  { value: "guestonline", label: "Guestonline", implemented: false, webhookAuth: "bearer", credentialFields: [{ key: "apiKey", label: "API Key" }, { key: "restaurantId", label: "Restaurant ID" }] },
];

const SYNC_ENTITY_OPTIONS = [
  { value: "reservation", label: "Reservations" },
  { value: "order", label: "Commandes" },
  { value: "menu_item", label: "Items menu" },
  { value: "offer", label: "Offres / Formules" },
  { value: "table", label: "Tables & Salles" },
  { value: "customer", label: "Clients" },
  { value: "availability", label: "Disponibilites" },
];

const MASTER_FOR_OPTIONS = [
  { value: "reservation", label: "Reservations" },
  { value: "order", label: "Commandes" },
  { value: "menu_item", label: "Items menu" },
  { value: "offer", label: "Offres / Formules" },
  { value: "table", label: "Tables & Salles" },
  { value: "customer", label: "Clients" },
  { value: "availability", label: "Disponibilites" },
];

interface SyncConfigUI {
  id?: string;
  platform: string;
  credentials: Record<string, string>;
  masterFor: string[];
  syncEntities: string[];
  supportsWebhook: boolean;
  webhookUrl: string | null;
  webhookSecret: string;
  pollIntervalSec: number;
  isActive: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

const EMPTY_SYNC_CONFIG: SyncConfigUI = {
  platform: "",
  credentials: {},
  masterFor: [],
  syncEntities: ["reservation"],
  supportsWebhook: true,
  webhookUrl: null,
  webhookSecret: "",
  pollIntervalSec: 300,
  isActive: true,
  lastSyncAt: null,
  lastError: null,
};

const CUISINE_TYPES: { value: string; label: string }[] = [
  { value: "pizza", label: "Pizza" },
  { value: "kebab", label: "Kebab" },
  { value: "burger", label: "Burger" },
  { value: "sushi", label: "Sushi" },
  { value: "italien", label: "Italien" },
  { value: "chinois", label: "Chinois" },
  { value: "indien", label: "Indien" },
  { value: "mexicain", label: "Mexicain" },
  { value: "libanais", label: "Libanais" },
  { value: "thai", label: "Tha\u00ef" },
  { value: "japonais", label: "Japonais" },
  { value: "coreen", label: "Cor\u00e9en" },
  { value: "vietnamien", label: "Vietnamien" },
  { value: "turc", label: "Turc" },
  { value: "grec", label: "Grec" },
  { value: "francais", label: "Fran\u00e7ais" },
  { value: "fast_food", label: "Fast Food" },
  { value: "other", label: "Autre" },
];

const VOICE_OPTIONS = [
  { value: "sage", label: "Sage (calme, posée)" },
  { value: "alloy", label: "Alloy (neutre)" },
  { value: "echo", label: "Echo (grave)" },
  { value: "fable", label: "Fable (chaleureuse)" },
  { value: "onyx", label: "Onyx (profonde)" },
  { value: "nova", label: "Nova (dynamique)" },
  { value: "shimmer", label: "Shimmer (douce)" },
];

interface RestaurantData {
  id: string;
  name: string;
  cuisineType: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  lat: number | null;
  lng: number | null;
  welcomeMessage: string;
  aiVoice: string;
  aiInstructions: string | null;
  deliveryEnabled: boolean;
  deliveryRadiusKm: number;
  deliveryFee: number;
  deliveryFreeAbove: number | null;
  minOrderAmount: number;
  avgPrepTimeMin: number;
  openingHoursText: string[];
  website: string | null;
  menuUrl: string | null;
  coverImage: string | null;
  gallery: string[];
  isActive: boolean;
  reservationEnabled: boolean;
  totalSeats: number;
  avgMealDurationMin: number;
  minReservationAdvanceMin: number;
  maxReservationAdvanceDays: number;
  planningConfig: PlanningConfig;
  orderStatusEnabled: boolean;
  transferEnabled: boolean;
  transferPhoneNumber: string | null;
  transferAutomatic: boolean;
  transferCases: string | null;
  maxParallelCalls: number;
}

interface PhoneLineData {
  id: string;
  phoneNumber: string;
  provider: string;
  sipDomain: string | null;
  sipUsername: string | null;
  hasSipPassword: boolean;
  twilioTrunkSid: string | null;
  isActive: boolean;
}

export default function SettingsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [data, setData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newHour, setNewHour] = useState("");
  const [newGalleryUrl, setNewGalleryUrl] = useState("");

  // SIP config state
  const [sipEnabled, setSipEnabled] = useState(false);
  const [sipBridge, setSipBridge] = useState(false);
  const [sipPhoneNumber, setSipPhoneNumber] = useState("");
  const [sipProvider, setSipProvider] = useState("twilio");
  const [sipDomain, setSipDomain] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [sipTwilioTrunkSid, setSipTwilioTrunkSid] = useState("");
  const [sipIsActive, setSipIsActive] = useState(true);
  const [sipHasPassword, setSipHasPassword] = useState(false);
  const [sipSaving, setSipSaving] = useState(false);
  const [sipMessage, setSipMessage] = useState<{ type: string; text: string } | null>(null);

  // Sync integrations state
  const [syncConfigs, setSyncConfigs] = useState<SyncConfigUI[]>([]);
  const [syncEditing, setSyncEditing] = useState<SyncConfigUI | null>(null);
  const [syncSaving, setSyncSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/restaurants?id=${restaurantId}`).then((r) => r.json()),
      fetch(`/api/phone-lines?restaurantId=${restaurantId}`).then((r) => r.json()),
      fetch(`/api/sync-configs?restaurantId=${restaurantId}`).then((r) => r.json()),
    ])
      .then(([restaurantData, phoneData, syncData]) => {
        setData(restaurantData);
        setSipEnabled(phoneData.sipEnabled || false);
        setSipBridge(phoneData.sipBridge || false);
        if (phoneData.phoneLine) {
          setSipPhoneNumber(phoneData.phoneLine.phoneNumber || "");
          setSipProvider(phoneData.phoneLine.provider || "twilio");
          setSipDomain(phoneData.phoneLine.sipDomain || "");
          setSipUsername(phoneData.phoneLine.sipUsername || "");
          setSipTwilioTrunkSid(phoneData.phoneLine.twilioTrunkSid || "");
          setSipIsActive(phoneData.phoneLine.isActive);
          setSipHasPassword(phoneData.phoneLine.hasSipPassword);
        }
        if (Array.isArray(syncData)) setSyncConfigs(syncData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [restaurantId]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/restaurants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setData(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof RestaurantData>(key: K, value: RestaurantData[K]) => {
    setData((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const saveSipConfig = async () => {
    setSipSaving(true);
    setSipMessage(null);
    try {
      const res = await fetch("/api/phone-lines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          sipEnabled,
          sipBridge,
          phoneNumber: sipPhoneNumber,
          provider: sipBridge ? "sip" : "twilio",
          sipDomain: sipBridge ? sipDomain : null,
          sipUsername: sipBridge ? sipUsername : null,
          sipPassword: sipBridge && sipPassword ? sipPassword : undefined,
          twilioTrunkSid: !sipBridge ? sipTwilioTrunkSid : null,
          isActive: sipIsActive,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setSipHasPassword(result.phoneLine?.hasSipPassword || false);
        setSipPassword("");
        setSipMessage({ type: "success", text: "Configuration SIP enregistrée" });
        setTimeout(() => setSipMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        setSipMessage({ type: "danger", text: err.error || "Erreur" });
      }
    } catch {
      setSipMessage({ type: "danger", text: "Erreur réseau" });
    } finally {
      setSipSaving(false);
    }
  };

  const saveSyncConfig = async () => {
    if (!syncEditing) return;
    setSyncSaving(true);
    setSyncMessage(null);
    try {
      const isNew = !syncEditing.id;
      const method = isNew ? "POST" : "PATCH";
      const plat = SYNC_PLATFORMS.find((p) => p.value === syncEditing.platform);
      const supportsWebhook = plat?.webhookAuth !== "none";
      const editingWithWebhook = { ...syncEditing, supportsWebhook };
      const payload = isNew
        ? { restaurantId, ...editingWithWebhook }
        : { id: editingWithWebhook.id, ...editingWithWebhook };

      const res = await fetch("/api/sync-configs", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        if (isNew) {
          setSyncConfigs((prev) => [...prev, saved]);
        } else {
          setSyncConfigs((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        }
        setSyncEditing(null);
        setSyncMessage({ type: "success", text: "Integration enregistree" });
        setTimeout(() => setSyncMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        setSyncMessage({ type: "danger", text: err.error || "Erreur" });
      }
    } catch {
      setSyncMessage({ type: "danger", text: "Erreur reseau" });
    } finally {
      setSyncSaving(false);
    }
  };

  const deleteSyncConfig = async (id: string) => {
    if (!confirm("Supprimer cette integration ?")) return;
    try {
      const res = await fetch(`/api/sync-configs?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSyncConfigs((prev) => prev.filter((c) => c.id !== id));
        setSyncMessage({ type: "success", text: "Integration supprimee" });
        setTimeout(() => setSyncMessage(null), 3000);
      }
    } catch {
      setSyncMessage({ type: "danger", text: "Erreur reseau" });
    }
  };

  const updateSyncEditing = <K extends keyof SyncConfigUI>(key: K, value: SyncConfigUI[K]) => {
    setSyncEditing((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const toggleArrayField = (field: "masterFor" | "syncEntities", value: string) => {
    if (!syncEditing) return;
    const arr = syncEditing[field];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    updateSyncEditing(field, next);
  };

  if (loading) {
    return <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>;
  }
  if (!data) {
    return <div className="text-center py-5 text-muted">Restaurant introuvable</div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Paramètres</h4>
          <small className="text-muted">{data.name}</small>
        </div>
        <button className="btn btn-primary d-flex align-items-center gap-2" onClick={save} disabled={saving}>
          {saving ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check-lg"></i>}
          Enregistrer
        </button>
      </div>

      {saved && (
        <div className="alert alert-success py-2 d-flex align-items-center gap-2">
          <i className="bi bi-check-circle"></i> Modifications enregistrées
        </div>
      )}

      {/* ── Informations générales ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-shop me-2"></i>Informations générales</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label">Nom du restaurant</label>
              <input className="form-control" value={data.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Type de cuisine</label>
              <select className="form-select" value={data.cuisineType} onChange={(e) => update("cuisineType", e.target.value)}>
                {CUISINE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Téléphone</label>
              <input className={`form-control ${data.phone && !isValidE164(data.phone) ? "is-invalid" : ""}`} value={formatPhoneDisplay(data.phone || "")} onChange={(e) => update("phone", e.target.value.replace(/[\s.\-()]/g, "") || null)} placeholder="+33..." />
              {data.phone && !isValidE164(data.phone) && <div className="invalid-feedback">Format E.164 requis (ex: +33612345678)</div>}
            </div>
            <div className="col-md-4">
              <label className="form-label">Site web</label>
              <input className="form-control" value={data.website || ""} onChange={(e) => update("website", e.target.value || null)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">URL du menu</label>
              <input className="form-control" value={data.menuUrl || ""} onChange={(e) => update("menuUrl", e.target.value || null)} />
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" checked={data.isActive} onChange={(e) => update("isActive", e.target.checked)} />
                <label className="form-check-label">Restaurant actif</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-person me-2"></i>Contact</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nom du contact</label>
              <input className="form-control" value={data.contactName || ""} onChange={(e) => update("contactName", e.target.value || null)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Email du contact</label>
              <input className="form-control" type="email" value={data.contactEmail || ""} onChange={(e) => update("contactEmail", e.target.value || null)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Adresse & GPS ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-geo-alt me-2"></i>Adresse</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Adresse</label>
              <input className="form-control" value={data.address || ""} onChange={(e) => update("address", e.target.value || null)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Ville</label>
              <input className="form-control" value={data.city || ""} onChange={(e) => update("city", e.target.value || null)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Code postal</label>
              <input className="form-control" value={data.postalCode || ""} onChange={(e) => update("postalCode", e.target.value || null)} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Latitude</label>
              <input className="form-control" type="number" step="0.0000001" value={data.lat ?? ""} onChange={(e) => update("lat", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Longitude</label>
              <input className="form-control" type="number" step="0.0000001" value={data.lng ?? ""} onChange={(e) => update("lng", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Livraison ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-truck me-2"></i>Livraison</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" checked={data.deliveryEnabled} onChange={(e) => update("deliveryEnabled", e.target.checked)} />
                <label className="form-check-label">Livraison activée</label>
              </div>
            </div>
            {data.deliveryEnabled && (
              <>
                <div className="col-md-3">
                  <label className="form-label">Rayon (km)</label>
                  <input className="form-control" type="number" step="0.5" value={data.deliveryRadiusKm} onChange={(e) => update("deliveryRadiusKm", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Frais de livraison (€)</label>
                  <input className="form-control" type="number" step="0.5" value={data.deliveryFee} onChange={(e) => update("deliveryFee", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Gratuit au-dessus de (€)</label>
                  <input className="form-control" type="number" step="1" value={data.deliveryFreeAbove ?? ""} onChange={(e) => update("deliveryFreeAbove", e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Commande minimum (€)</label>
                  <input className="form-control" type="number" step="1" value={data.minOrderAmount} onChange={(e) => update("minOrderAmount", parseFloat(e.target.value) || 0)} />
                </div>
              </>
            )}
            <div className="col-md-3">
              <label className="form-label">Temps de préparation moy. (min)</label>
              <input className="form-control" type="number" value={data.avgPrepTimeMin} onChange={(e) => update("avgPrepTimeMin", parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Reservations ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-calendar-check me-2"></i>Reservations</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" checked={data.reservationEnabled} onChange={(e) => update("reservationEnabled", e.target.checked)} />
                <label className="form-check-label">Reservations activees</label>
              </div>
            </div>
            {data.reservationEnabled && (
              <>
                <div className="col-md-3">
                  <label className="form-label">Nombre de places</label>
                  <input className="form-control" type="number" value={data.totalSeats} onChange={(e) => update("totalSeats", parseInt(e.target.value) || 0)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Duree repas moy. (min)</label>
                  <input className="form-control" type="number" value={data.avgMealDurationMin} onChange={(e) => update("avgMealDurationMin", parseInt(e.target.value) || 90)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Avance min. (min)</label>
                  <input className="form-control" type="number" value={data.minReservationAdvanceMin} onChange={(e) => update("minReservationAdvanceMin", parseInt(e.target.value) || 30)} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Avance max. (jours)</label>
                  <input className="form-control" type="number" value={data.maxReservationAdvanceDays} onChange={(e) => update("maxReservationAdvanceDays", parseInt(e.target.value) || 30)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Planning / Capacité ── */}
      <PlanningConfigCard
        config={data.planningConfig && data.planningConfig.enabled !== undefined ? data.planningConfig : DEFAULT_PLANNING_CONFIG}
        onChange={(cfg) => update("planningConfig", cfg)}
      />

      {/* ── Configuration IA ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-robot me-2"></i>Configuration IA</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Voix IA</label>
              <select className="form-select" value={data.aiVoice} onChange={(e) => update("aiVoice", e.target.value)}>
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Message d&apos;accueil</label>
              <textarea className="form-control" rows={2} value={data.welcomeMessage} onChange={(e) => update("welcomeMessage", e.target.value)} />
            </div>
            <div className="col-12">
              <label className="form-label">Instructions supplémentaires</label>
              <textarea className="form-control" rows={4} value={data.aiInstructions || ""} onChange={(e) => update("aiInstructions", e.target.value || null)} placeholder="Instructions spécifiques pour l'IA (ex: toujours proposer un dessert, vouvoyer le client...)" />
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" checked={data.orderStatusEnabled} onChange={(e) => update("orderStatusEnabled", e.target.checked)} />
                <label className="form-check-label">Suivi de commande par téléphone</label>
              </div>
              <div className="form-text">
                Permet aux clients de demander le statut de leur commande en cours lors d&apos;un appel.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Horaires ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-clock me-2"></i>Horaires d&apos;ouverture</div>
        <div className="card-body">
          {data.openingHoursText.length === 0 && (
            <p className="text-muted mb-2">Aucun horaire configuré</p>
          )}
          {data.openingHoursText.map((line, i) => (
            <div key={i} className="d-flex align-items-center gap-2 mb-2">
              <input
                className="form-control"
                value={line}
                onChange={(e) => {
                  const arr = [...data.openingHoursText];
                  arr[i] = e.target.value;
                  update("openingHoursText", arr);
                }}
              />
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => update("openingHoursText", data.openingHoursText.filter((_, j) => j !== i))}
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          ))}
          <div className="d-flex gap-2 mt-2">
            <input
              className="form-control form-control-sm"
              placeholder="Ex: Lun-Ven 11:00-14:00, 18:00-22:00"
              value={newHour}
              onChange={(e) => setNewHour(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newHour.trim()) {
                  update("openingHoursText", [...data.openingHoursText, newHour.trim()]);
                  setNewHour("");
                }
              }}
            />
            <button
              className="btn btn-outline-primary btn-sm"
              disabled={!newHour.trim()}
              onClick={() => {
                update("openingHoursText", [...data.openingHoursText, newHour.trim()]);
                setNewHour("");
              }}
            >
              <i className="bi bi-plus"></i>
            </button>
          </div>
        </div>
      </div>

      {/* ── Photos ── */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-image me-2"></i>Photos</div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label">Photo de couverture (URL)</label>
            <input className="form-control" value={data.coverImage || ""} onChange={(e) => update("coverImage", e.target.value || null)} />
            {data.coverImage && (
              <img src={data.coverImage} alt="cover" className="mt-2 rounded" style={{ maxHeight: 200, objectFit: "cover" }} />
            )}
          </div>

          <label className="form-label">Galerie</label>
          {data.gallery.length === 0 && <p className="text-muted mb-2">Aucune photo</p>}
          <div className="row g-2 mb-2">
            {data.gallery.map((url, i) => (
              <div key={i} className="col-6 col-md-3 position-relative">
                <img src={url} alt={`photo-${i}`} className="rounded w-100" style={{ height: 120, objectFit: "cover" }} />
                <button
                  className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1"
                  style={{ padding: "2px 6px", fontSize: "0.7rem" }}
                  onClick={() => update("gallery", data.gallery.filter((_, j) => j !== i))}
                >
                  <i className="bi bi-x"></i>
                </button>
              </div>
            ))}
          </div>
          <div className="d-flex gap-2">
            <input
              className="form-control form-control-sm"
              placeholder="URL de la photo"
              value={newGalleryUrl}
              onChange={(e) => setNewGalleryUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGalleryUrl.trim()) {
                  update("gallery", [...data.gallery, newGalleryUrl.trim()]);
                  setNewGalleryUrl("");
                }
              }}
            />
            <button
              className="btn btn-outline-primary btn-sm"
              disabled={!newGalleryUrl.trim()}
              onClick={() => {
                update("gallery", [...data.gallery, newGalleryUrl.trim()]);
                setNewGalleryUrl("");
              }}
            >
              <i className="bi bi-plus"></i>
            </button>
          </div>
        </div>
      </div>

      {/* ── Téléphonie SIP ── */}
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-telephone me-2"></i>Téléphonie SIP
        </div>
        <div className="card-body">
          {sipMessage && (
            <div className={`alert alert-${sipMessage.type} py-2 d-flex align-items-center gap-2`}>
              <i className={`bi ${sipMessage.type === "success" ? "bi-check-circle" : "bi-exclamation-triangle"}`}></i>
              {sipMessage.text}
            </div>
          )}

          {/* Enable SIP service switch */}
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="sipEnabledSwitch"
              checked={sipEnabled}
              onChange={(e) => setSipEnabled(e.target.checked)}
            />
            <label className="form-check-label fw-bold" htmlFor="sipEnabledSwitch">
              Activer le service vocal
            </label>
            <div className="form-text">
              {sipEnabled
                ? "Le service vocal est actif — l'agent sera disponible pour recevoir des appels."
                : "Le service vocal est désactivé — aucun agent ne sera démarré."}
            </div>
          </div>

          {sipEnabled && (
            <>
              <hr />
              <div className="row g-3">
                {/* Line active toggle */}
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" checked={sipIsActive} onChange={(e) => setSipIsActive(e.target.checked)} />
                    <label className="form-check-label">Ligne active</label>
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="col-12">
                  <label className="form-label fw-bold">Mode</label>
                  <div className="btn-group w-100">
                    <button
                      type="button"
                      className={`btn ${sipBridge ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setSipBridge(true)}
                    >
                      <i className="bi bi-diagram-3 me-1"></i>SIP Bridge (pjsip)
                    </button>
                    <button
                      type="button"
                      className={`btn ${!sipBridge ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setSipBridge(false)}
                    >
                      <i className="bi bi-cloud me-1"></i>Twilio
                    </button>
                  </div>
                </div>

                {/* Phone number */}
                <div className="col-md-6">
                  <label className="form-label">Numéro de téléphone</label>
                  <input className={`form-control ${sipPhoneNumber && !isValidE164(sipPhoneNumber) ? "is-invalid" : ""}`} value={formatPhoneDisplay(sipPhoneNumber)} onChange={(e) => setSipPhoneNumber(e.target.value.replace(/[\s.\-()]/g, ""))} placeholder="+33972360682" />
                  {sipPhoneNumber && !isValidE164(sipPhoneNumber) && <div className="invalid-feedback">Format E.164 requis (ex: +33972360682)</div>}
                </div>

                {sipBridge ? (
                  <>
                    <div className="col-md-6">
                      <label className="form-label">Domaine SIP</label>
                      <input className="form-control" value={sipDomain} onChange={(e) => setSipDomain(e.target.value)} placeholder="Ex: sip.ovh.fr" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Utilisateur SIP</label>
                      <input className="form-control" value={sipUsername} onChange={(e) => setSipUsername(e.target.value)} placeholder="Ex: 0033972360682" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">
                        Mot de passe SIP
                        {sipHasPassword && <span className="badge bg-success ms-2">Configuré</span>}
                      </label>
                      <input className="form-control" type="password" value={sipPassword} onChange={(e) => setSipPassword(e.target.value)} placeholder={sipHasPassword ? "Laisser vide pour ne pas changer" : "Mot de passe SIP"} />
                    </div>
                  </>
                ) : (
                  <div className="col-md-6">
                    <label className="form-label">Twilio Trunk SID</label>
                    <input className="form-control" value={sipTwilioTrunkSid} onChange={(e) => setSipTwilioTrunkSid(e.target.value)} placeholder="TK..." />
                  </div>
                )}

                {/* Appels simultanés max */}
                <div className="col-md-6">
                  <label className="form-label">Appels simultanes max</label>
                  <input
                    className="form-control"
                    type="number"
                    min={1}
                    max={50}
                    value={data.maxParallelCalls}
                    onChange={(e) => update("maxParallelCalls", parseInt(e.target.value) || 10)}
                  />
                  <div className="form-text">
                    Nombre maximum d'appels en parallele (au-dela : signal occupe).
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="mt-3 d-flex justify-content-end">
            <button className="btn btn-primary d-flex align-items-center gap-2" onClick={saveSipConfig} disabled={sipSaving}>
              {sipSaving ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check-lg"></i>}
              Enregistrer la config SIP
            </button>
          </div>
        </div>
      </div>

      {/* ── Transfert d'appel ── */}
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-telephone-forward me-2"></i>Transfert d'appel
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="transferEnabledSwitch"
                  checked={data.transferEnabled}
                  onChange={(e) => update("transferEnabled", e.target.checked)}
                />
                <label className="form-check-label fw-bold" htmlFor="transferEnabledSwitch">
                  Activer le transfert d'appel
                </label>
                <div className="form-text">
                  Permet a l'IA de transferer l'appel vers un humain dans certains cas.
                </div>
              </div>
            </div>
            {data.transferEnabled && (
              <>
                <div className="col-md-6">
                  <label className="form-label">Numero de transfert</label>
                  <input
                    className={`form-control ${data.transferPhoneNumber && !isValidE164(data.transferPhoneNumber) ? "is-invalid" : ""}`}
                    value={formatPhoneDisplay(data.transferPhoneNumber || "")}
                    onChange={(e) => update("transferPhoneNumber", e.target.value.replace(/[\s.\-()]/g, "") || null)}
                    placeholder="Ex: +33612345678"
                  />
                  {data.transferPhoneNumber && !isValidE164(data.transferPhoneNumber) && <div className="invalid-feedback">Format E.164 requis (ex: +33612345678)</div>}
                  <div className="form-text">
                    Numero vers lequel les appels seront transferes.
                  </div>
                </div>
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="transferAutomaticSwitch"
                      checked={data.transferAutomatic}
                      onChange={(e) => update("transferAutomatic", e.target.checked)}
                    />
                    <label className="form-check-label fw-bold" htmlFor="transferAutomaticSwitch">
                      Transfert automatique (sans IA)
                    </label>
                    <div className="form-text">
                      L'appel est directement transfere au numero ci-dessus des le decroche, sans passer par l'IA.
                    </div>
                  </div>
                </div>
                {!data.transferAutomatic && (
                  <div className="col-12">
                    <label className="form-label">Cas de transfert (instructions pour l'IA)</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={data.transferCases || ""}
                      onChange={(e) => update("transferCases", e.target.value || null)}
                      placeholder={"Ex:\n- Le client insiste pour parler a un humain\n- Reclamation grave ou litige\n- Demande trop complexe pour l'IA"}
                    />
                    <div className="form-text">
                      Texte libre decrivant quand l'IA doit proposer un transfert. Injecte dans le prompt systeme.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Intégrations (sync) ── */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span><i className="bi bi-shuffle me-2"></i>Integrations (sync)</span>
          {!syncEditing && (
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => setSyncEditing({ ...EMPTY_SYNC_CONFIG })}
            >
              <i className="bi bi-plus-lg me-1"></i>Ajouter
            </button>
          )}
        </div>
        <div className="card-body">
          {syncMessage && (
            <div className={`alert alert-${syncMessage.type} py-2 d-flex align-items-center gap-2`}>
              <i className={`bi ${syncMessage.type === "success" ? "bi-check-circle" : "bi-exclamation-triangle"}`}></i>
              {syncMessage.text}
            </div>
          )}

          {/* Liste des configs existantes */}
          {syncConfigs.length === 0 && !syncEditing && (
            <p className="text-muted mb-0">Aucune integration configuree.</p>
          )}

          {syncConfigs.map((cfg) => (
            <div key={cfg.id} className="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <strong>{SYNC_PLATFORMS.find((p) => p.value === cfg.platform)?.label || cfg.platform}</strong>
                <span className={`badge ${cfg.isActive ? "bg-success" : "bg-secondary"}`}>
                  {cfg.isActive ? "Actif" : "Inactif"}
                </span>
                {cfg.lastSyncAt ? (
                  <small className="text-muted" title={cfg.lastSyncAt}>
                    <i className="bi bi-arrow-repeat me-1"></i>
                    {new Date(cfg.lastSyncAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </small>
                ) : (
                  <small className="text-muted">Jamais synchronise</small>
                )}
                {cfg.lastError && (
                  <span className="badge bg-danger" title={cfg.lastError}>
                    <i className="bi bi-exclamation-triangle me-1"></i>Erreur
                  </span>
                )}
              </div>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setSyncEditing({
                    ...cfg,
                    credentials: {},
                    webhookSecret: "",
                  })}
                >
                  <i className="bi bi-pencil"></i>
                </button>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => cfg.id && deleteSyncConfig(cfg.id)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>
            </div>
          ))}

          {/* Formulaire d'édition */}
          {syncEditing && (
            <div className="border rounded p-3 mt-3 bg-light">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">
                  {syncEditing.id ? "Modifier l\u2019integration" : "Nouvelle integration"}
                </h6>
                {syncEditing.id && (
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={syncEditing.isActive}
                      onChange={(e) => updateSyncEditing("isActive", e.target.checked)}
                    />
                    <label className="form-check-label fw-bold">
                      {syncEditing.isActive ? "Actif" : "Inactif"}
                    </label>
                  </div>
                )}
              </div>
              <div className="row g-3">
                {/* Plateforme */}
                <div className="col-md-4">
                  <label className="form-label">Plateforme</label>
                  <select
                    className="form-select"
                    value={syncEditing.platform}
                    disabled={!!syncEditing.id}
                    onChange={(e) => {
                      updateSyncEditing("platform", e.target.value);
                      updateSyncEditing("credentials", {});
                    }}
                  >
                    <option value="">-- Choisir --</option>
                    {SYNC_PLATFORMS.filter((p) =>
                      p.implemented && !syncConfigs.some((c) => c.platform === p.value && c.id !== syncEditing.id)
                    ).map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Credentials dynamiques */}
                {syncEditing.platform && SYNC_PLATFORMS.find((p) => p.value === syncEditing.platform)?.credentialFields.map((field) => (
                  <div className="col-md-4" key={field.key}>
                    <label className="form-label">
                      {field.label}
                      {syncEditing.id && <small className="text-muted ms-1">(vide = inchange)</small>}
                    </label>
                    <input
                      className="form-control"
                      type={field.type || "text"}
                      value={syncEditing.credentials[field.key] || ""}
                      onChange={(e) => updateSyncEditing("credentials", {
                        ...syncEditing.credentials,
                        [field.key]: e.target.value,
                      })}
                      placeholder={syncEditing.id ? "\u2022\u2022\u2022\u2022\u2022\u2022" : ""}
                    />
                  </div>
                ))}

                {/* Entités à synchroniser */}
                <div className="col-md-6">
                  <label className="form-label">Entites a synchroniser</label>
                  <div className="d-flex gap-3">
                    {SYNC_ENTITY_OPTIONS.map((opt) => (
                      <div className="form-check" key={opt.value}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={syncEditing.syncEntities.includes(opt.value)}
                          onChange={() => toggleArrayField("syncEntities", opt.value)}
                        />
                        <label className="form-check-label">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Master for */}
                <div className="col-md-6">
                  <label className="form-label">Source de verite pour</label>
                  <div className="d-flex gap-3">
                    {MASTER_FOR_OPTIONS.map((opt) => (
                      <div className="form-check" key={opt.value}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={syncEditing.masterFor.includes(opt.value)}
                          onChange={() => toggleArrayField("masterFor", opt.value)}
                        />
                        <label className="form-check-label">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                  <div className="form-text">
                    Si coche, la plateforme est maitre pour ce type (ses modifications ecrasent les notres).
                  </div>
                </div>

                {/* Webhook — affiché automatiquement si la plateforme supporte les webhooks */}
                {syncEditing.platform && SYNC_PLATFORMS.find((p) => p.value === syncEditing.platform)?.webhookAuth !== "none" && (
                  <>
                    <div className="col-md-8">
                      <label className="form-label">URL Webhook (a configurer sur la plateforme)</label>
                      <div className="input-group">
                        <input
                          className="form-control bg-white"
                          readOnly
                          value={syncEditing.webhookUrl || `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${syncEditing.platform}`}
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() => {
                            const url = syncEditing.webhookUrl || `${window.location.origin}/api/webhooks/${syncEditing.platform}`;
                            navigator.clipboard.writeText(url);
                          }}
                        >
                          <i className="bi bi-clipboard"></i>
                        </button>
                      </div>
                    </div>
                    <div className="col-md-4">
                      {(() => {
                        const plat = SYNC_PLATFORMS.find((p) => p.value === syncEditing.platform);
                        const isBearerAuth = plat?.webhookAuth === "bearer";
                        const label = isBearerAuth ? "Bearer Token" : "Secret HMAC";
                        const isRequired = !syncEditing.id;
                        return (
                          <>
                            <label className="form-label">
                              {label} <span className="text-danger">*</span>
                              {syncEditing.id && <small className="text-muted ms-1">(vide = inchange)</small>}
                            </label>
                            <div className="input-group">
                              <input
                                className="form-control"
                                type="password"
                                value={syncEditing.webhookSecret}
                                onChange={(e) => updateSyncEditing("webhookSecret", e.target.value)}
                                placeholder={syncEditing.id ? "\u2022\u2022\u2022\u2022\u2022\u2022" : label}
                                required={isRequired}
                              />
                              {!isBearerAuth && (
                                <button
                                  className="btn btn-outline-secondary"
                                  type="button"
                                  title="Generer un secret aleatoire"
                                  onClick={() => {
                                    const bytes = new Uint8Array(32);
                                    crypto.getRandomValues(bytes);
                                    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
                                    updateSyncEditing("webhookSecret", hex);
                                  }}
                                >
                                  <i className="bi bi-key"></i>
                                </button>
                              )}
                            </div>
                            <div className="form-text">
                              {isBearerAuth
                                ? "Token envoye par la plateforme dans le header Authorization: Bearer."
                                : "Cle partagee pour la signature HMAC-SHA256. Cliquer sur la cle pour generer."}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}

              </div>

              {/* Boutons */}
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-outline-secondary" onClick={() => setSyncEditing(null)}>
                  Annuler
                </button>
                <button
                  className="btn btn-primary d-flex align-items-center gap-2"
                  onClick={saveSyncConfig}
                  disabled={syncSaving || !syncEditing.platform || (!syncEditing.id && !syncEditing.webhookSecret)}
                >
                  {syncSaving ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check-lg"></i>}
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Planning Config Card ──

const RESOURCES_LIST: Resource[] = ["cuisine", "preparation", "comptoir", "livraison"];
const SIZES: OrderSize[] = ["S", "M", "L"];
const SIZE_LABELS: Record<OrderSize, string> = { S: "Petite (1-2 art.)", M: "Moyenne (3-5 art.)", L: "Grande (6+ art.)" };

function PlanningConfigCard({
  config,
  onChange,
}: {
  config: PlanningConfig;
  onChange: (cfg: PlanningConfig) => void;
}) {
  const updateField = <K extends keyof PlanningConfig>(key: K, value: PlanningConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateBandCapacity = (bandIdx: number, resource: Resource, value: number) => {
    const bands = [...config.timeBands];
    bands[bandIdx] = {
      ...bands[bandIdx],
      capacity: { ...bands[bandIdx].capacity, [resource]: value },
    };
    updateField("timeBands", bands);
  };

  const updateBandField = (bandIdx: number, field: "label" | "startTime" | "endTime", value: string) => {
    const bands = [...config.timeBands];
    bands[bandIdx] = { ...bands[bandIdx], [field]: value };
    updateField("timeBands", bands);
  };

  const addBand = () => {
    updateField("timeBands", [
      ...config.timeBands,
      { label: "Nouveau", startTime: "12:00", endTime: "14:00", capacity: { ...config.defaultCapacity } },
    ]);
  };

  const removeBand = (idx: number) => {
    updateField("timeBands", config.timeBands.filter((_, i) => i !== idx));
  };

  const updateSizeProfile = (size: OrderSize, field: string, value: number) => {
    updateField("sizeProfiles", {
      ...config.sizeProfiles,
      [size]: { ...config.sizeProfiles[size], [field]: value },
    });
  };

  const updateDefaultCapacity = (resource: Resource, value: number) => {
    updateField("defaultCapacity", { ...config.defaultCapacity, [resource]: value });
  };

  return (
    <div className="card mb-4">
      <div className="card-header">
        <i className="bi bi-kanban me-2"></i>Planning / Capacité
      </div>
      <div className="card-body">
        {/* Enable toggle */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateField("enabled", e.target.checked)}
          />
          <label className="form-check-label">Planning activé</label>
        </div>

        {config.enabled && (
          <>
            {/* Buffers & general */}
            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <label className="form-label">Durée slot (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={15}
                  value={config.slotMinutes}
                  onChange={(e) => updateField("slotMinutes", parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Horizon (slots)</label>
                <input
                  className="form-control"
                  type="number"
                  min={12}
                  max={96}
                  value={config.horizonSlots}
                  onChange={(e) => updateField("horizonSlots", parseInt(e.target.value) || 48)}
                />
                <small className="text-muted">{config.horizonSlots * config.slotMinutes} min = {((config.horizonSlots * config.slotMinutes) / 60).toFixed(1)}h</small>
              </div>
              <div className="col-md-2">
                <label className="form-label">Buffer pickup (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min={0}
                  value={config.bufferPickupMin}
                  onChange={(e) => updateField("bufferPickupMin", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Buffer livraison (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min={0}
                  value={config.bufferDeliveryMin}
                  onChange={(e) => updateField("bufferDeliveryMin", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Décalage max (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min={15}
                  value={config.maxShiftMin}
                  onChange={(e) => updateField("maxShiftMin", parseInt(e.target.value) || 120)}
                />
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <label className="form-label">Durée session de service (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min={15}
                  max={300}
                  value={config.reservationSessionMin}
                  onChange={(e) => updateField("reservationSessionMin", parseInt(e.target.value) || 90)}
                />
                <small className="text-muted">Durée moyenne d&apos;une réservation</small>
              </div>
            </div>

            {/* Default capacity */}
            <h6 className="fw-bold mb-2" style={{ fontSize: "0.85rem" }}>
              <i className="bi bi-sliders me-1"></i>Capacité par défaut (pts/slot)
            </h6>
            <div className="row g-2 mb-4">
              {RESOURCES_LIST.map((r) => (
                <div className="col-md-3" key={r}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>{RESOURCE_LABELS[r]}</label>
                  <input
                    className="form-control form-control-sm"
                    type="number"
                    min={0}
                    value={config.defaultCapacity[r]}
                    onChange={(e) => updateDefaultCapacity(r, parseInt(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>

            {/* Time bands */}
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold mb-0" style={{ fontSize: "0.85rem" }}>
                <i className="bi bi-clock me-1"></i>Tranches horaires
              </h6>
              <button className="btn btn-sm btn-outline-primary" onClick={addBand}>
                <i className="bi bi-plus me-1"></i>Ajouter
              </button>
            </div>
            {config.timeBands.map((band, bi) => (
              <div key={bi} className="card border mb-2">
                <div className="card-body py-2 px-3">
                  <div className="row g-2 align-items-center">
                    <div className="col-md-2">
                      <input
                        className="form-control form-control-sm"
                        value={band.label}
                        onChange={(e) => updateBandField(bi, "label", e.target.value)}
                        placeholder="Nom"
                      />
                    </div>
                    <div className="col-md-2">
                      <input
                        className="form-control form-control-sm"
                        type="time"
                        value={band.startTime}
                        onChange={(e) => updateBandField(bi, "startTime", e.target.value)}
                      />
                    </div>
                    <div className="col-auto" style={{ fontSize: "0.8rem" }}>→</div>
                    <div className="col-md-2">
                      <input
                        className="form-control form-control-sm"
                        type="time"
                        value={band.endTime}
                        onChange={(e) => updateBandField(bi, "endTime", e.target.value)}
                      />
                    </div>
                    {RESOURCES_LIST.map((r) => (
                      <div className="col" key={r}>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text" style={{ fontSize: "0.65rem", padding: "2px 4px" }}>
                            {RESOURCE_LABELS[r].slice(0, 4)}
                          </span>
                          <input
                            className="form-control"
                            type="number"
                            min={0}
                            value={band.capacity[r]}
                            onChange={(e) => updateBandCapacity(bi, r, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="col-auto">
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeBand(bi)}>
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Size profiles */}
            <h6 className="fw-bold mt-4 mb-2" style={{ fontSize: "0.85rem" }}>
              <i className="bi bi-bar-chart me-1"></i>Profils de taille (charge par commande)
            </h6>
            <div className="table-responsive">
              <table className="table table-sm" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>Taille</th>
                    <th>Slots cuisine</th>
                    <th>Pts cuisine/slot</th>
                    <th>Pts préparation</th>
                    <th>Pts comptoir</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZES.map((size) => (
                    <tr key={size}>
                      <td className="fw-bold">{size} — {SIZE_LABELS[size]}</td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min={1}
                          max={10}
                          style={{ maxWidth: 70 }}
                          value={config.sizeProfiles[size].cuisineSlots}
                          onChange={(e) => updateSizeProfile(size, "cuisineSlots", parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min={0}
                          style={{ maxWidth: 70 }}
                          value={config.sizeProfiles[size].cuisinePts}
                          onChange={(e) => updateSizeProfile(size, "cuisinePts", parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min={0}
                          style={{ maxWidth: 70 }}
                          value={config.sizeProfiles[size].preparationPts}
                          onChange={(e) => updateSizeProfile(size, "preparationPts", parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min={0}
                          style={{ maxWidth: 70 }}
                          value={config.sizeProfiles[size].comptoirPts}
                          onChange={(e) => updateSizeProfile(size, "comptoirPts", parseInt(e.target.value) || 0)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
