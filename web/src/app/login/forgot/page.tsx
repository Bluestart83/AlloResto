import ForgotForm from "./ForgotForm";

export const metadata = {
  title: "Mot de passe oublié — VoiceOrder AI",
};

export default function ForgotPasswordPage() {
  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="text-center mb-4">
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
            style={{ width: 56, height: 56, backgroundColor: "var(--vo-primary)" }}
          >
            <i className="bi bi-envelope-fill text-white fs-4"></i>
          </div>
          <h4 className="fw-bold">Mot de passe oubli&eacute;</h4>
          <p className="text-muted">
            Entrez votre email, nous vous enverrons un lien de r&eacute;initialisation.
          </p>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <ForgotForm />
          </div>
        </div>
      </div>
    </div>
  );
}
