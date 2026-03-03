"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cookie-consent");
    setConsent(stored === "accepted");

    const handler = () => {
      setConsent(localStorage.getItem("cookie-consent") === "accepted");
    };
    window.addEventListener("cookie-consent-update", handler);
    return () => window.removeEventListener("cookie-consent-update", handler);
  }, []);

  if (!GA_ID || !consent) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
