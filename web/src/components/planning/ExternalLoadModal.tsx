"use client";

import { useState } from "react";
import {
  type ExternalLoadType,
  type LoadIntensity,
  type Resource,
  EXTERNAL_LOAD_PRESETS,
  INTENSITY_POINTS,
  RESOURCE_LABELS,
} from "@/types/planning";

interface ExternalLoadModalProps {
  restaurantId: string;
  onClose: () => void;
  onCreated: () => void;
}

const DURATION_OPTIONS = [10, 20, 30, 60];
const ALL_RESOURCES: { key: Resource; label: string }[] = [
  { key: "cuisine", label: RESOURCE_LABELS.cuisine },
  { key: "preparation", label: RESOURCE_LABELS.preparation },
  { key: "comptoir", label: RESOURCE_LABELS.comptoir },
  { key: "livraison", label: RESOURCE_LABELS.livraison },
];

export default function ExternalLoadModal({
  restaurantId,
  onClose,
  onCreated,
}: ExternalLoadModalProps) {
  const [type, setType] = useState<ExternalLoadType>("dine_in");
  const [resources, setResources] = useState<Resource[]>(EXTERNAL_LOAD_PRESETS.dine_in.resources);
  const [intensity, setIntensity] = useState<LoadIntensity>("medium");
  const [durationMin, setDurationMin] = useState(30);
  const [startNow, setStartNow] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (t: ExternalLoadType) => {
    setType(t);
    const preset = EXTERNAL_LOAD_PRESETS[t];
    if (preset.resources.length > 0) {
      setResources([...preset.resources]);
    }
  };

  const toggleResource = (r: Resource) => {
    setResources((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const handleSubmit = async (andDuplicate = false) => {
    if (resources.length === 0) return;
    setSaving(true);

    try {
      await fetch("/api/planning/external-loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          type,
          resource: resources[0],
          resources,
          intensity,
          durationMin,
          startTime: startNow ? undefined : startTime || undefined,
          label: label || undefined,
        }),
      });

      if (andDuplicate) {
        setSaving(false);
        onCreated();
      } else {
        onCreated();
        onClose();
      }
    } catch {
      setSaving(false);
    }
  };

  const points = INTENSITY_POINTS[intensity];
  const totalSlots = Math.ceil(durationMin / 5);

  return (
    <div
      className="modal d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h6 className="modal-title">
              <i className="bi bi-plus-circle me-2"></i>Charge externe
            </h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {/* Type preset */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Type
              </label>
              <div className="d-flex gap-2 flex-wrap">
                {(Object.entries(EXTERNAL_LOAD_PRESETS) as [ExternalLoadType, typeof EXTERNAL_LOAD_PRESETS.dine_in][]).map(
                  ([key, preset]) => (
                    <button
                      key={key}
                      className={`btn btn-sm ${type === key ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => handleTypeChange(key)}
                    >
                      {preset.label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Resources */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Ressources impactées
              </label>
              <div className="d-flex gap-2">
                {ALL_RESOURCES.map((r) => (
                  <button
                    key={r.key}
                    className={`btn btn-sm ${resources.includes(r.key) ? "btn-dark" : "btn-outline-secondary"}`}
                    onClick={() => toggleResource(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Intensité
              </label>
              <div className="d-flex gap-2">
                {(["low", "medium", "high"] as LoadIntensity[]).map((i) => (
                  <button
                    key={i}
                    className={`btn btn-sm ${intensity === i ? "btn-warning" : "btn-outline-secondary"}`}
                    onClick={() => setIntensity(i)}
                  >
                    {i === "low" ? "Faible" : i === "medium" ? "Moyen" : "Fort"}
                    <small className="ms-1 opacity-75">({INTENSITY_POINTS[i]}pts)</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Durée
              </label>
              <div className="d-flex gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    className={`btn btn-sm ${durationMin === d ? "btn-info" : "btn-outline-secondary"}`}
                    onClick={() => setDurationMin(d)}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            {/* Start time */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Début
              </label>
              <div className="d-flex align-items-center gap-2">
                <button
                  className={`btn btn-sm ${startNow ? "btn-dark" : "btn-outline-secondary"}`}
                  onClick={() => setStartNow(true)}
                >
                  Maintenant
                </button>
                <button
                  className={`btn btn-sm ${!startNow ? "btn-dark" : "btn-outline-secondary"}`}
                  onClick={() => setStartNow(false)}
                >
                  Horaire
                </button>
                {!startNow && (
                  <input
                    type="time"
                    className="form-control form-control-sm"
                    style={{ maxWidth: 130 }}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Label */}
            <div className="mb-3">
              <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>
                Note <span className="text-muted fw-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Ex: 5 couverts terrasse"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            {/* Preview */}
            <div className="p-2 rounded" style={{ backgroundColor: "#f8f9fa", fontSize: "0.8rem" }}>
              <i className="bi bi-info-circle me-1"></i>
              <strong>{points} pts/slot</strong> sur {resources.join(", ")} pendant{" "}
              <strong>{totalSlots} slots</strong> ({durationMin} min)
              {resources.length > 0 && (
                <span className="text-muted">
                  {" "}= {points * totalSlots * resources.length} pts total
                </span>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              Annuler
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => handleSubmit(true)}
              disabled={saving || resources.length === 0}
            >
              <i className="bi bi-plus me-1"></i>Ajouter & dupliquer
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleSubmit(false)}
              disabled={saving || resources.length === 0}
            >
              <i className="bi bi-plus me-1"></i>Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
