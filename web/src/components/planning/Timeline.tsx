"use client";

import { useState } from "react";
import type { TimelineSlot, TimelineBlock, Resource } from "@/types/planning";

interface TimelineProps {
  slots: TimelineSlot[];
  blocks: TimelineBlock[];
  anchorTime: string;
}

const RESOURCES: { key: Resource; label: string; icon: string }[] = [
  { key: "cuisine", label: "Cuisine", icon: "bi-fire" },
  { key: "preparation", label: "Préparation", icon: "bi-box-seam" },
  { key: "comptoir", label: "Comptoir", icon: "bi-currency-dollar" },
  { key: "livraison", label: "Livraison", icon: "bi-bicycle" },
];

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getBarColor(used: number, capacity: number): string {
  if (capacity === 0) return "var(--vo-muted, #6b7280)";
  const ratio = used / capacity;
  if (ratio > 1) return "var(--vo-danger, #ef4444)";
  if (ratio > 0.7) return "var(--vo-warning, #f59e0b)";
  return "var(--vo-success, #10b981)";
}

function getNowSlotIndex(anchorTime: string, slotMinutes: number): number {
  const now = new Date();
  const anchor = new Date(anchorTime);
  const diff = (now.getTime() - anchor.getTime()) / 60_000;
  return Math.floor(diff / slotMinutes);
}

export default function Timeline({ slots, blocks, anchorTime }: TimelineProps) {
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const nowIdx = getNowSlotIndex(anchorTime, 5);

  // Group blocks by resource
  const blocksByResource: Record<Resource, TimelineBlock[]> = {
    cuisine: [],
    preparation: [],
    comptoir: [],
    livraison: [],
  };
  for (const b of blocks) {
    blocksByResource[b.resource]?.push(b);
  }

  return (
    <div className="planning-timeline-wrapper">
      {/* Time header */}
      <div className="planning-timeline-grid">
        <div className="planning-resource-label" style={{ borderBottom: "2px solid #dee2e6" }}>
          <small className="text-muted fw-semibold">Heure</small>
        </div>
        {slots.map((slot, i) => (
          <div
            key={`h-${i}`}
            className={`planning-slot-header ${i === nowIdx ? "planning-now-slot" : ""}`}
          >
            {i % 3 === 0 && (
              <small className="text-muted" style={{ fontSize: "0.6rem" }}>
                {formatSlotTime(slot.time)}
              </small>
            )}
          </div>
        ))}
      </div>

      {/* Resource rows */}
      {RESOURCES.map((res) => (
        <div key={res.key} className="planning-timeline-grid">
          <div className="planning-resource-label">
            <i className={`bi ${res.icon} me-1`}></i>
            <small className="fw-semibold">{res.label}</small>
          </div>
          {slots.map((slot, i) => {
            const used = slot.used[res.key];
            const cap = slot.capacity[res.key];
            const remaining = cap - used;
            const pct = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
            const overflow = used > cap;

            // Find blocks on this slot+resource
            const slotBlocks = blocksByResource[res.key].filter(
              (b) => i >= b.startSlot && i <= b.endSlot
            );

            return (
              <div
                key={`${res.key}-${i}`}
                className={`planning-slot ${i === nowIdx ? "planning-now-slot" : ""} ${overflow ? "planning-slot-overflow" : ""}`}
                title={`${res.label} ${formatSlotTime(slot.time)}: ${used}/${cap} pts`}
              >
                {/* Background fill bar */}
                <div
                  className="planning-slot-fill"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: getBarColor(used, cap),
                  }}
                />
                {/* Block indicators */}
                {slotBlocks.map((b) => (
                  <div
                    key={b.id}
                    className={`planning-block-dot ${b.type === "order" ? "planning-block-order" : "planning-block-external"}`}
                    onMouseEnter={() => setHoveredBlock(b.id)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    style={{
                      backgroundColor:
                        b.type === "order"
                          ? b.meta.orderType === "delivery"
                            ? "var(--vo-primary, #4f46e5)"
                            : "#0d6efd"
                          : "#6b7280",
                    }}
                  />
                ))}
                {/* Capacity number */}
                {cap > 0 && (
                  <span className="planning-slot-number" style={{ color: overflow ? "#ef4444" : undefined }}>
                    {remaining}
                  </span>
                )}
                {/* Hover tooltip */}
                {slotBlocks.some((b) => b.id === hoveredBlock) && (
                  <div className="planning-tooltip">
                    {slotBlocks
                      .filter((b) => b.id === hoveredBlock)
                      .map((b) => (
                        <div key={b.id}>
                          <strong>{b.label}</strong>
                          <br />
                          <small>
                            {b.type === "order" ? `${b.meta.orderType} · ${b.meta.orderSize}` : `Charge: ${b.meta.loadType}`}
                            {" · "}{b.points} pts
                          </small>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
