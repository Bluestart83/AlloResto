import Link from "next/link";

export const metadata = {
  title: "VoiceOrder AI — Assistant vocal pour restaurants",
};

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <nav className="border-bottom" style={{ backgroundColor: "#fff" }}>
        <div className="container d-flex align-items-center justify-content-between py-3">
          <div className="d-flex align-items-center gap-2">
            <div
              className="d-flex align-items-center justify-content-center rounded-3"
              style={{ width: 36, height: 36, backgroundColor: "var(--vo-primary)" }}
            >
              <i className="bi bi-telephone-fill text-white"></i>
            </div>
            <span className="fw-bold" style={{ fontSize: "1.1rem" }}>
              VoiceOrder AI
            </span>
          </div>
          <Link
            href="/login"
            className="btn btn-sm text-white"
            style={{ backgroundColor: "var(--vo-primary)" }}
          >
            Se connecter
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="flex-grow-1 d-flex align-items-center"
        style={{
          background: "linear-gradient(135deg, #eef2ff 0%, #f8f9fa 50%, #e0e7ff 100%)",
        }}
      >
        <div className="container py-5">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <div className="mb-3">
                <span
                  className="badge rounded-pill px-3 py-2"
                  style={{ backgroundColor: "var(--vo-primary-light)", color: "var(--vo-primary)", fontSize: "0.8rem" }}
                >
                  <i className="bi bi-stars me-1"></i>
                  Propuls&eacute; par l&apos;IA
                </span>
              </div>
              <h1 className="fw-bold mb-3" style={{ fontSize: "2.75rem", lineHeight: 1.15 }}>
                L&apos;assistant vocal
                <br />
                <span style={{ color: "var(--vo-primary)" }}>intelligent</span> pour
                <br />
                votre restaurant
              </h1>
              <p className="text-muted mb-4" style={{ fontSize: "1.15rem", maxWidth: 500 }}>
                Automatisez vos prises de commandes et r&eacute;servations par t&eacute;l&eacute;phone
                gr&acirc;ce &agrave; une IA conversationnelle naturelle. Disponible 24h/24.
              </p>
              <div className="d-flex gap-3">
                <Link
                  href="/login"
                  className="btn btn-lg text-white px-4"
                  style={{ backgroundColor: "var(--vo-primary)" }}
                >
                  <i className="bi bi-box-arrow-in-right me-2"></i>
                  Se connecter
                </Link>
              </div>
            </div>
            <div className="col-lg-6 text-center">
              <div
                className="rounded-4 p-4 mx-auto"
                style={{
                  maxWidth: 420,
                  backgroundColor: "rgba(79, 70, 229, 0.06)",
                  border: "1px solid rgba(79, 70, 229, 0.12)",
                }}
              >
                <div className="d-flex flex-column gap-3">
                  {/* Mock conversation */}
                  <div className="d-flex gap-2 align-items-start">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 32, height: 32, backgroundColor: "var(--vo-primary)" }}
                    >
                      <i className="bi bi-robot text-white" style={{ fontSize: "0.8rem" }}></i>
                    </div>
                    <div
                      className="rounded-3 p-2 px-3"
                      style={{ backgroundColor: "#fff", fontSize: "0.85rem", textAlign: "left" }}
                    >
                      Bonjour ! Bienvenue chez La Bella Vita. Que puis-je faire pour vous ?
                    </div>
                  </div>
                  <div className="d-flex gap-2 align-items-start justify-content-end">
                    <div
                      className="rounded-3 p-2 px-3 text-white"
                      style={{ backgroundColor: "var(--vo-primary)", fontSize: "0.85rem", textAlign: "left" }}
                    >
                      Je voudrais commander une pizza margherita et une tiramisu
                    </div>
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 32, height: 32, backgroundColor: "#e5e7eb" }}
                    >
                      <i className="bi bi-person" style={{ fontSize: "0.8rem" }}></i>
                    </div>
                  </div>
                  <div className="d-flex gap-2 align-items-start">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 32, height: 32, backgroundColor: "var(--vo-primary)" }}
                    >
                      <i className="bi bi-robot text-white" style={{ fontSize: "0.8rem" }}></i>
                    </div>
                    <div
                      className="rounded-3 p-2 px-3"
                      style={{ backgroundColor: "#fff", fontSize: "0.85rem", textAlign: "left" }}
                    >
                      Parfait ! Une pizza margherita et un tiramisu.
                      Ce sera en livraison ou &agrave; emporter ?
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-5" style={{ backgroundColor: "#fff" }}>
        <div className="container">
          <h2 className="text-center fw-bold mb-2">Tout ce qu&apos;il faut</h2>
          <p className="text-center text-muted mb-5">
            Une solution compl&egrave;te pour digitaliser votre accueil t&eacute;l&eacute;phonique
          </p>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="card border-0 h-100" style={{ backgroundColor: "#f8f9fa" }}>
                <div className="card-body p-4">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-3 mb-3"
                    style={{ width: 48, height: 48, backgroundColor: "var(--vo-primary-light)" }}
                  >
                    <i className="bi bi-telephone-inbound" style={{ color: "var(--vo-primary)", fontSize: "1.25rem" }}></i>
                  </div>
                  <h5 className="fw-bold">Commandes vocales IA</h5>
                  <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                    L&apos;IA prend les commandes par t&eacute;l&eacute;phone en langage naturel.
                    Elle conna&icirc;t votre menu, g&egrave;re les options et calcule les prix automatiquement.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 h-100" style={{ backgroundColor: "#f8f9fa" }}>
                <div className="card-body p-4">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-3 mb-3"
                    style={{ width: 48, height: 48, backgroundColor: "rgba(16,185,129,0.1)" }}
                  >
                    <i className="bi bi-calendar-check" style={{ color: "var(--vo-success)", fontSize: "1.25rem" }}></i>
                  </div>
                  <h5 className="fw-bold">R&eacute;servations intelligentes</h5>
                  <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                    Gestion automatique des cr&eacute;neaux, v&eacute;rification de la capacit&eacute;
                    en temps r&eacute;el et confirmation instantan&eacute;e au client.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 h-100" style={{ backgroundColor: "#f8f9fa" }}>
                <div className="card-body p-4">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-3 mb-3"
                    style={{ width: 48, height: 48, backgroundColor: "rgba(245,158,11,0.1)" }}
                  >
                    <i className="bi bi-graph-up" style={{ color: "var(--vo-warning)", fontSize: "1.25rem" }}></i>
                  </div>
                  <h5 className="fw-bold">Tableau de bord temps r&eacute;el</h5>
                  <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                    Suivez vos commandes, appels et performances en direct.
                    Planning cuisine, gestion des salles et historique complet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-4 border-top text-center">
        <div className="container">
          <small className="text-muted">
            VoiceOrder AI &mdash; Assistant vocal IA pour restaurants
          </small>
        </div>
      </footer>
    </div>
  );
}
