import LoginForm from "./LoginForm";

export const metadata = {
  title: "Connexion — VoiceOrder AI",
};

export default function LoginPage() {
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
            <i className="bi bi-telephone-fill text-white fs-4"></i>
          </div>
          <h4 className="fw-bold">VoiceOrder AI</h4>
          <p className="text-muted">Connectez-vous &agrave; votre compte</p>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
