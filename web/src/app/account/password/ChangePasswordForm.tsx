"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import PasswordRules, { PasswordMatch, passwordIsValid } from "@/components/ui/PasswordRules";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!passwordIsValid(newPassword)) {
      setError("Le mot de passe ne respecte pas les règles de complexité");
      return;
    }
    if (newPassword !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setLoading(false);

    if (changeError) {
      setError(changeError.message || "Mot de passe actuel incorrect");
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-danger py-2" style={{ fontSize: "0.875rem" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success py-2" style={{ fontSize: "0.875rem" }}>
          Mot de passe modifi&eacute; avec succ&egrave;s !
        </div>
      )}
      <div className="mb-3">
        <label className="form-label small fw-medium">Mot de passe actuel</label>
        <input
          type="password"
          className="form-control"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Nouveau mot de passe</label>
        <input
          type="password"
          className="form-control"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          placeholder="Min. 8 caractères"
        />
        <PasswordRules password={newPassword} />
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Confirmer le nouveau mot de passe</label>
        <input
          type="password"
          className="form-control"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <PasswordMatch password={newPassword} confirm={confirm} />
      </div>
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary flex-grow-1"
          onClick={() => router.back()}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="btn text-white flex-grow-1"
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
      </div>
    </form>
  );
}
