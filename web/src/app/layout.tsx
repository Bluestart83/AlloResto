import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";

export const metadata = {
  title: "VoiceOrder AI — Dashboard",
  description: "Système de commande vocale IA pour restaurants",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <GoogleAnalytics />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
