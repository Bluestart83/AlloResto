"use client";

import { useState } from "react";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";

type Step = "search" | "review_info" | "menu_source" | "review_menu" | "confirm";

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
  const [importData, setImportData] = useState<any>(null);
  const [menuData, setMenuData] = useState<any>(null);
  const [mapsUrl, setMapsUrl] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [menuPhotos, setMenuPhotos] = useState<string[]>([]);
  const [loadingMenuPhotos, setLoadingMenuPhotos] = useState(false);

  const currentIndex = steps.findIndex((s) => s.key === step);

  const handleImportFromUrl = async () => {
    if (!mapsUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/import?action=from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: mapsUrl }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
      await handleSelectPlace(data.placeId);
    } catch {
      setError("Erreur lors de l'import depuis l'URL");
      setLoading(false);
    }
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

  const handleScanGooglePhotos = async (urls: string[]) => {
    if (urls.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/import?action=scan-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      setMenuData(await resp.json());
      setStep("review_menu");
    } catch {
      setError("Erreur lors du scan des photos");
    }
    setLoading(false);
  };

  const togglePhoto = (url: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const allPhotos: string[] = importData?.restaurant?.images
    ? [importData.restaurant.images.cover, ...importData.restaurant.images.gallery].filter(Boolean)
    : [];

  const goToMenuStep = async () => {
    setStep("menu_source");
    // Fetch menu photos via SerpApi when entering step 3
    if (importData?.restaurant?.name && menuPhotos.length === 0) {
      setLoadingMenuPhotos(true);
      try {
        const resp = await fetch("/api/import?action=fetch-menu-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: importData.restaurant.name,
            address: importData.restaurant.address || "",
          }),
        });
        const data = await resp.json();
        if (data.photos?.length > 0) {
          setMenuPhotos(data.photos);
          // Store SerpApi raw data in import metadata for persistence
          if (data.serpapi_raw) {
            setImportData((prev: any) => ({
              ...prev,
              _import_metadata: { ...prev?._import_metadata, serpapi_photos_raw: data.serpapi_raw },
            }));
          }
        }
      } catch (e) {
        console.error("Failed to fetch menu photos:", e);
      }
      setLoadingMenuPhotos(false);
    }
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
            <PlacesAutocomplete onSelect={handleSelectPlace} disabled={loading} />

            <div className="d-flex align-items-center my-4">
              <hr className="flex-grow-1" />
              <span className="mx-3 text-muted fw-medium">ou</span>
              <hr className="flex-grow-1" />
            </div>

            <label className="form-label text-muted">
              <i className="bi bi-link-45deg me-1"></i>Coller un lien Google Maps
            </label>
            <div className="input-group">
              <input
                type="url"
                className="form-control"
                placeholder="https://www.google.com/maps/place/..."
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImportFromUrl()}
                disabled={loading}
              />
              <button className="btn btn-primary" onClick={handleImportFromUrl} disabled={loading || !mapsUrl.trim()}>
                {loading ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-arrow-right"></i>}
              </button>
            </div>
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
              <div className="col-md-6">
                <label className="form-label">Type de cuisine</label>
                <select className="form-select"
                  value={importData.restaurant.cuisine_type || "other"}
                  onChange={(e) => setImportData({
                    ...importData,
                    restaurant: { ...importData.restaurant, cuisine_type: e.target.value },
                  })}>
                  {CUISINE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Horaires d'ouverture */}
            {importData.restaurant.opening_hours_text?.length > 0 && (
              <div className="mt-4">
                <h6 className="fw-semibold mb-2">
                  <i className="bi bi-clock me-1"></i>Horaires d&apos;ouverture
                </h6>
                <div className="row g-1">
                  {importData.restaurant.opening_hours_text.map((line: string, i: number) => (
                    <div key={i} className="col-md-6">
                      <small className="text-muted">{line}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photos Google Places */}
            {allPhotos.length > 0 && (
              <div className="mt-4">
                <h6 className="fw-semibold mb-2">
                  <i className="bi bi-images me-1"></i>Photos Google Places
                  <small className="text-muted fw-normal ms-2">{allPhotos.length} photo(s)</small>
                </h6>
                <div className="d-flex flex-wrap gap-2">
                  {allPhotos.map((url: string, i: number) => (
                    <div
                      key={i}
                      className={`position-relative border rounded overflow-hidden ${selectedPhotos.has(url) ? "border-primary border-2" : ""}`}
                      style={{ width: 120, height: 90, cursor: "pointer" }}
                      onClick={() => togglePhoto(url)}
                    >
                      <img src={url} alt={`Photo ${i + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {selectedPhotos.has(url) && (
                        <div className="position-absolute top-0 end-0 m-1">
                          <span className="badge bg-primary rounded-circle"><i className="bi bi-check"></i></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Bouton scan commun */}
            {selectedPhotos.size > 0 && (
              <button className="btn btn-sm btn-outline-primary mt-3"
                onClick={() => handleScanGooglePhotos(Array.from(selectedPhotos))}
                disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-cpu me-1"></i>}
                Scanner {selectedPhotos.size} photo(s) avec l&apos;IA
              </button>
            )}

            <div className="d-flex justify-content-between mt-4">
              <button className="btn btn-outline-secondary" onClick={() => setStep("search")}>
                <i className="bi bi-chevron-left me-1"></i>Retour
              </button>
              <button className="btn btn-primary" onClick={goToMenuStep}>
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

            {/* Google Places photos + Menu photos */}
            {(allPhotos.length > 0 || menuPhotos.length > 0 || loadingMenuPhotos) && (
              <div className="card border mb-4">
                <div className="card-body">
                  {allPhotos.length > 0 && (
                    <>
                      <h6 className="fw-semibold mb-3">
                        <i className="bi bi-google me-1 text-primary"></i>Photos Google Places
                      </h6>
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        {allPhotos.map((url: string, i: number) => (
                          <div
                            key={i}
                            className={`position-relative border rounded overflow-hidden ${selectedPhotos.has(url) ? "border-primary border-2 shadow-sm" : ""}`}
                            style={{ width: 110, height: 85, cursor: "pointer" }}
                            onClick={() => togglePhoto(url)}
                          >
                            <img src={url} alt={`Photo ${i + 1}`}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <div className={`position-absolute top-0 end-0 m-1 ${selectedPhotos.has(url) ? "" : "d-none"}`}>
                              <span className="badge bg-primary rounded-circle"><i className="bi bi-check"></i></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {loadingMenuPhotos && (
                    <div className="d-flex align-items-center gap-2 mb-3 text-success">
                      <span className="spinner-border spinner-border-sm"></span>
                      <span>Recherche des photos de menu...</span>
                    </div>
                  )}

                  {menuPhotos.length > 0 && (
                    <>
                      <h6 className="fw-semibold mb-3">
                        <i className="bi bi-card-list me-1 text-success"></i>Photos du menu
                        <small className="text-muted fw-normal ms-2">{menuPhotos.length} photo(s)</small>
                        <span className="badge bg-success-subtle text-success ms-2" style={{ fontSize: "0.7rem" }}>SerpApi</span>
                      </h6>
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        {menuPhotos.map((url: string, i: number) => (
                          <div
                            key={`menu-${i}`}
                            className={`position-relative border rounded overflow-hidden ${selectedPhotos.has(url) ? "border-success border-2 shadow-sm" : "border-success-subtle"}`}
                            style={{ width: 110, height: 85, cursor: "pointer" }}
                            onClick={() => togglePhoto(url)}
                          >
                            <img src={url} alt={`Menu ${i + 1}`}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <div className={`position-absolute top-0 end-0 m-1 ${selectedPhotos.has(url) ? "" : "d-none"}`}>
                              <span className="badge bg-success rounded-circle"><i className="bi bi-check"></i></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={loading || selectedPhotos.size === 0}
                    onClick={() => handleScanGooglePhotos(Array.from(selectedPhotos))}
                  >
                    {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-cpu me-1"></i>}
                    Scanner {selectedPhotos.size || ""} photo(s) sélectionnée(s)
                  </button>
                </div>
              </div>
            )}

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
              <a href="/admin/customers" className="btn btn-primary">Voir les restaurants</a>
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
