"use client";

import { useEffect, useState } from "react";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cookie-consent");
    if (!stored) {
      setVisible(true);
    }
  }, []);

  function respond(choice: "accepted" | "refused") {
    localStorage.setItem("cookie-consent", choice);
    setVisible(false);
    window.dispatchEvent(new Event("cookie-consent-update"));
  }

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <div className="cookie-banner-text">
          <i className="bi bi-shield-lock me-2"></i>
          Ce site utilise des cookies pour mesurer l&apos;audience via Google Analytics.
          Aucune donnée personnelle n&apos;est partagée à des fins publicitaires.
        </div>
        <div className="cookie-banner-actions">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => respond("refused")}
          >
            Refuser
          </button>
          <button
            className="btn btn-sm text-white"
            style={{ backgroundColor: "var(--vo-primary)" }}
            onClick={() => respond("accepted")}
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
