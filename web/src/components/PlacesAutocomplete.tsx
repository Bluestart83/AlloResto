"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Prediction {
  place_id: string;
  main_text: string;
  secondary_text: string;
}

interface PlacesAutocompleteProps {
  onSelect: (placeId: string) => void;
  disabled?: boolean;
}

export default function PlacesAutocomplete({ onSelect, disabled }: PlacesAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch("/api/import?action=autocomplete-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await resp.json();
      console.log("[PlacesAutocomplete] response:", data);
      setPredictions(data.predictions || []);
      setOpen((data.predictions || []).length > 0);
      setActiveIndex(-1);
    } catch {
      setPredictions([]);
    }
    setLoading(false);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(value), 300);
  };

  const handleSelect = (placeId: string) => {
    setOpen(false);
    setPredictions([]);
    onSelect(placeId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || predictions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < predictions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : predictions.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(predictions[activeIndex].place_id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="position-relative">
      <div className="input-group">
        <span className="input-group-text bg-white">
          {loading
            ? <span className="spinner-border spinner-border-sm text-muted"></span>
            : <i className="bi bi-search text-muted"></i>
          }
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Rechercher un restaurant..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {open && predictions.length > 0 && (
        <div className="list-group position-absolute w-100 shadow-sm mt-1" style={{ zIndex: 1050 }}>
          {predictions.map((p, i) => (
            <button
              key={p.place_id}
              type="button"
              className={`list-group-item list-group-item-action d-flex align-items-center py-2 ${i === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => handleSelect(p.place_id)}
            >
              <i className={`bi bi-geo-alt me-3 ${i === activeIndex ? "" : "text-primary"}`}></i>
              <div className="text-truncate">
                <div className="fw-medium">{p.main_text}</div>
                <small className={i === activeIndex ? "text-white-50" : "text-muted"}>{p.secondary_text}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
