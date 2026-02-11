import { Suspense } from "react";
import ResetForm from "./ResetForm";

export const metadata = {
  title: "Nouveau mot de passe — VoiceOrder AI",
};

export default function ResetPasswordPage() {
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
            <i className="bi bi-key-fill text-white fs-4"></i>
          </div>
          <h4 className="fw-bold">Nouveau mot de passe</h4>
          <p className="text-muted">Choisissez un nouveau mot de passe pour votre compte.</p>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <Suspense fallback={<div className="text-center py-3"><span className="spinner-border spinner-border-sm" /></div>}>
              <ResetForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
