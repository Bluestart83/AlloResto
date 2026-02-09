"use client";

import { useState } from "react";

type Step = "search" | "review_info" | "menu_source" | "review_menu" | "confirm";

const steps: { key: Step; label: string; icon: string }[] = [
  { key: "search", label: "Recherche", icon: "bi-search" },
  { key: "review_info", label: "Infos resto", icon: "bi-geo-alt" },
  { key: "menu_source", label: "Import menu", icon: "bi-camera" },
  { key: "review_menu", label: "Validation", icon: "bi-pencil-square" },
  { key: "confirm", label: "Terminé", icon: "bi-check-circle" },
];

export default function ImportPage() {
  const [step, setStep] = useState<Step>("search");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCity, setSearchCity] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [importData, setImportData] = useState<any>(null);
  const [menuData, setMenuData] = useState<any>(null);

  const currentIndex = steps.findIndex((s) => s.key === step);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/import?action=search-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, city: searchCity }),
      });
      const data = await resp.json();
      setSearchResults(data.results || []);
    } catch {
      setError("Erreur lors de la recherche");
    }
    setLoading(false);
  };

  const handleSelectPlace = async (placeId: string) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/import?action=from-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      setImportData(await resp.json());
      setStep("review_info");
    } catch {
      setError("Erreur lors de l'import");
    }
    setLoading(false);
  };

  const handleMenuPhotos = async (files: FileList) => {
    setLoading(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("photos", f));
    try {
      const resp = await fetch("/api/import?action=scan-menu", { method: "POST", body: formData });
      setMenuData(await resp.json());
      setStep("review_menu");
    } catch {
      setError("Erreur lors du scan");
    }
    setLoading(false);
  };

  const handleWebScrape = async (url: string) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/import?action=scrape-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });
      setMenuData(await resp.json());
      setStep("review_menu");
    } catch {
      setError("Erreur lors du scraping");
    }
    setLoading(false);
  };

  const handlePersist = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/import?action=persist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...importData, menu: menuData }),
      });
      const data = await resp.json();
      if (data.success) setStep("confirm");
    } catch {
      setError("Erreur lors de la sauvegarde");
    }
    setLoading(false);
  };

  return (
    <>
      <h4 className="fw-bold mb-1">Import restaurant</h4>
      <p className="text-muted mb-4">Ajoutez un restaurant en quelques clics</p>

      {/* Stepper */}
      <div className="d-flex align-items-center gap-2 mb-4">
        {steps.map((s, i) => (
          <div key={s.key} className="d-flex align-items-center">
            <span className={`badge rounded-pill px-3 py-2 ${
              i === currentIndex ? "bg-primary" : i < currentIndex ? "bg-success" : "bg-light text-muted"
            }`}>
              <i className={`bi ${i < currentIndex ? "bi-check" : s.icon} me-1`}></i>
              {s.label}
            </span>
            {i < steps.length - 1 && <i className="bi bi-chevron-right text-muted mx-1"></i>}
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center py-2">
          <i className="bi bi-exclamation-triangle me-2"></i>{error}
          <button className="btn-close ms-auto" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* STEP 1: Search */}
      {step === "search" && (
        <div className="card border">
          <div className="card-body">
            <h5 className="fw-bold mb-3">Rechercher sur Google Places</h5>
            <div className="row g-3 mb-3">
              <div className="col-md-8">
                <label className="form-label">Nom du restaurant</label>
                <input className="form-control" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Pizzeria Bella Napoli" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Ville</label>
                <input className="form-control" value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Marseille" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-search me-1"></i>}
              Rechercher
            </button>

            {searchResults.length > 0 && (
              <div className="mt-4">
                <small className="text-muted">{searchResults.length} résultat(s)</small>
                <div className="list-group mt-2">
                  {searchResults.map((r: any) => (
                    <button key={r.place_id} className="list-group-item list-group-item-action d-flex align-items-center"
                      onClick={() => handleSelectPlace(r.place_id)}>
                      <i className="bi bi-geo-alt text-primary me-3"></i>
                      <div>
                        <div className="fw-medium">{r.name}</div>
                        <small className="text-muted">{r.address}</small>
                      </div>
                      <i className="bi bi-chevron-right ms-auto text-muted"></i>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Review info */}
      {step === "review_info" && importData?.restaurant && (
        <div className="card border">
          <div className="card-body">
            <h5 className="fw-bold mb-3">Vérifier les informations</h5>
            <div className="row g-3">
              {["name", "address", "city", "postal_code", "phone", "website"].map((key) => (
                <div className="col-md-6" key={key}>
                  <label className="form-label text-capitalize">{key.replace("_", " ")}</label>
                  <input className="form-control" value={importData.restaurant[key] || ""}
                    onChange={(e) => setImportData({
                      ...importData,
                      restaurant: { ...importData.restaurant, [key]: e.target.value },
                    })} />
                </div>
              ))}
            </div>
            <div className="d-flex justify-content-between mt-4">
              <button className="btn btn-outline-secondary" onClick={() => setStep("search")}>
                <i className="bi bi-chevron-left me-1"></i>Retour
              </button>
              <button className="btn btn-primary" onClick={() => setStep("menu_source")}>
                Importer le menu<i className="bi bi-chevron-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Menu source */}
      {step === "menu_source" && (
        <div className="card border">
          <div className="card-body">
            <h5 className="fw-bold mb-4">Comment importer le menu ?</h5>
            <div className="row g-4">
              {/* Photo scan */}
              <div className="col-md-4">
                <label className="card border-dashed text-center p-4 h-100" style={{ cursor: "pointer", borderStyle: "dashed" }}>
                  <i className="bi bi-camera fs-1 text-muted mb-2 d-block"></i>
                  <h6>Scanner le menu</h6>
                  <small className="text-muted">Uploadez des photos du menu</small>
                  <input type="file" accept="image/*" multiple className="d-none"
                    onChange={(e) => e.target.files && handleMenuPhotos(e.target.files)} />
                </label>
              </div>
              {/* Website */}
              <div className="col-md-4">
                <div className="card border p-4 h-100">
                  <i className="bi bi-globe fs-1 text-muted mb-2 d-block text-center"></i>
                  <h6 className="text-center">Depuis le site web</h6>
                  <input type="url" className="form-control form-control-sm mt-2"
                    placeholder="https://restaurant.fr/menu" id="scrape-url"
                    defaultValue={importData?.restaurant?.website || ""} />
                  <button className="btn btn-dark btn-sm mt-2 w-100" disabled={loading}
                    onClick={() => {
                      const url = (document.getElementById("scrape-url") as HTMLInputElement).value;
                      if (url) handleWebScrape(url);
                    }}>
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                    Extraire
                  </button>
                </div>
              </div>
              {/* JSON */}
              <div className="col-md-4">
                <div className="card border p-4 h-100">
                  <i className="bi bi-filetype-json fs-1 text-muted mb-2 d-block text-center"></i>
                  <h6 className="text-center">Import JSON</h6>
                  <textarea className="form-control form-control-sm mt-2 font-monospace" rows={3}
                    placeholder='{"categories":[],"items":[]}' id="json-input"></textarea>
                  <button className="btn btn-dark btn-sm mt-2 w-100"
                    onClick={() => {
                      const val = (document.getElementById("json-input") as HTMLTextAreaElement).value;
                      if (val) { setMenuData(JSON.parse(val)); setStep("review_menu"); }
                    }}>
                    Importer
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button className="btn btn-outline-secondary" onClick={() => setStep("review_info")}>
                <i className="bi bi-chevron-left me-1"></i>Retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Review menu */}
      {step === "review_menu" && menuData && (
        <div className="card border">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="fw-bold mb-0">Vérifier le menu</h5>
                <small className="text-muted">
                  {menuData.items?.length || 0} articles · {menuData.categories?.length || 0} catégories
                  {menuData.confidence && (
                    <span className={`badge ms-2 ${menuData.confidence > 0.9 ? "bg-success" : "bg-warning"}`}>
                      Confiance {Math.round(menuData.confidence * 100)}%
                    </span>
                  )}
                </small>
              </div>
            </div>

            {(menuData.categories || []).map((cat: any) => (
              <div key={cat.ref} className="mb-4">
                <h6 className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: "0.8rem" }}>
                  {cat.name} ({(menuData.items || []).filter((i: any) => i.category_ref === cat.ref).length})
                </h6>
                {(menuData.items || []).filter((i: any) => i.category_ref === cat.ref).map((item: any, idx: number) => (
                  <div key={idx} className="d-flex align-items-center gap-3 py-2 border-bottom">
                    <div className="flex-grow-1">
                      <div className="fw-medium">{item.name}</div>
                      {item.description && <small className="text-muted">{item.description}</small>}
                    </div>
                    <div className="input-group input-group-sm" style={{ width: 120 }}>
                      <input type="number" className="form-control text-end font-monospace"
                        value={item.price ?? ""} step="0.50"
                        onChange={(e) => {
                          const updated = { ...menuData };
                          const i = updated.items.findIndex((it: any) => it.ref === item.ref);
                          if (i >= 0) updated.items[i].price = parseFloat(e.target.value) || 0;
                          setMenuData({ ...updated });
                        }} />
                      <span className="input-group-text">€</span>
                    </div>
                    <button className="btn btn-sm btn-outline-danger"
                      onClick={() => setMenuData({
                        ...menuData,
                        items: menuData.items.filter((i: any) => i.ref !== item.ref),
                      })}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            ))}

            <div className="d-flex justify-content-between mt-4">
              <button className="btn btn-outline-secondary" onClick={() => setStep("menu_source")}>
                <i className="bi bi-chevron-left me-1"></i>Retour
              </button>
              <button className="btn btn-success" onClick={handlePersist} disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-circle me-1"></i>}
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Confirm */}
      {step === "confirm" && (
        <div className="card border text-center py-5">
          <div className="card-body">
            <div className="bg-success bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
              style={{ width: 64, height: 64 }}>
              <i className="bi bi-check-circle fs-1 text-success"></i>
            </div>
            <h4 className="fw-bold">Restaurant importé !</h4>
            <p className="text-muted mb-4">
              {importData?.restaurant?.name} est prêt à recevoir des commandes vocales.
            </p>
            <div className="d-flex gap-2 justify-content-center">
              <a href="/dashboard" className="btn btn-primary">Voir le dashboard</a>
              <button className="btn btn-outline-secondary"
                onClick={() => { setStep("search"); setImportData(null); setMenuData(null); }}>
                Ajouter un autre
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
