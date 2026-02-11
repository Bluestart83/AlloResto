"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import PasswordRules, { PasswordMatch, passwordIsValid } from "@/components/ui/PasswordRules";

export default function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!passwordIsValid(password)) {
      setError("Le mot de passe ne respecte pas les règles de complexité");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (!token) {
      setError("Lien invalide ou expiré");
      return;
    }

    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message || "Lien expiré ou invalide");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center py-3">
        <i className="bi bi-check-circle text-success" style={{ fontSize: "2.5rem" }}></i>
        <p className="mt-3 mb-1 fw-medium">Mot de passe modifi&eacute; !</p>
        <p className="text-muted" style={{ fontSize: "0.875rem" }}>
          Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
        </p>
        <Link
          href="/login"
          className="btn text-white mt-2"
          style={{ backgroundColor: "var(--vo-primary)" }}
        >
          Se connecter
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
        <label className="form-label small fw-medium">Nouveau mot de passe</label>
        <input
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          placeholder="Min. 8 caractères"
        />
        <PasswordRules password={password} />
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Confirmer le mot de passe</label>
        <input
          type="password"
          className="form-control"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Confirmer"
        />
        <PasswordMatch password={password} confirm={confirm} />
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
          <i className="bi bi-check-lg me-2"></i>
        )}
        Enregistrer
      </button>
    </form>
  );
}
