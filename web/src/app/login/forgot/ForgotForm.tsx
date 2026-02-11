"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: reqError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/login/reset",
    });

    setLoading(false);

    if (reqError) {
      setError(reqError.message || "Une erreur est survenue");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center py-3">
        <i className="bi bi-check-circle text-success" style={{ fontSize: "2.5rem" }}></i>
        <p className="mt-3 mb-1 fw-medium">Email envoy&eacute; !</p>
        <p className="text-muted" style={{ fontSize: "0.875rem" }}>
          Si un compte existe avec cette adresse, vous recevrez un lien de r&eacute;initialisation.
        </p>
        <Link href="/login" className="btn btn-outline-secondary btn-sm mt-2">
          Retour &agrave; la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-danger py-2" style={{ fontSize: "0.875rem" }}>
          {error}
        </div>
      )}
      <div className="mb-3">
        <label className="form-label small fw-medium">Email</label>
        <input
          type="email"
          className="form-control"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="votre@email.com"
        />
      </div>
      <button
        type="submit"
        className="btn w-100 text-white"
        style={{ backgroundColor: "var(--vo-primary)" }}
        disabled={loading}
      >
        {loading ? (
          <span className="spinner-border spinner-border-sm me-2" />
        ) : (
          <i className="bi bi-envelope me-2"></i>
        )}
        Envoyer le lien
      </button>
      <div className="text-center mt-3">
        <Link href="/login" className="text-muted" style={{ fontSize: "0.85rem" }}>
          Retour &agrave; la connexion
        </Link>
      </div>
    </form>
  );
}
