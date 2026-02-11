"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { ROLE_ADMIN } from "@/lib/roles";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signInError } = await signIn.email({
      email,
      password,
    });

    setLoading(false);

    if (signInError || !data) {
      const msg = signInError?.message || "";
      if (msg.includes("email") && msg.includes("verified")) {
        setError("Veuillez vérifier votre adresse email avant de vous connecter. Consultez votre boîte de réception.");
      } else {
        setError("Email ou mot de passe incorrect");
      }
      return;
    }

    // Redirect based on role
    const user = data.user as Record<string, unknown>;
    if (user.role === ROLE_ADMIN) {
      router.push("/admin/customers");
    } else if (user.restaurantId) {
      router.push(`/place/${user.restaurantId}/dashboard`);
    } else {
      router.push("/admin/customers");
    }
    router.refresh();
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
      <div className="mb-3">
        <label className="form-label small fw-medium">Mot de passe</label>
        <input
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="********"
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
          <i className="bi bi-box-arrow-in-right me-2"></i>
        )}
        Se connecter
      </button>
      <div className="text-center mt-3">
        <a
          href="/login/forgot"
          className="text-decoration-none small"
          style={{ color: "var(--vo-primary)" }}
        >
          Mot de passe oublié ?
        </a>
      </div>

      <div className="d-flex align-items-center my-3">
        <hr className="flex-grow-1" />
        <span className="px-3 text-muted small">ou</span>
        <hr className="flex-grow-1" />
      </div>

      <button
        type="button"
        className="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2"
        onClick={() => signIn.social({ provider: "google", callbackURL: "/admin/customers" })}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Se connecter avec Google
      </button>
    </form>
  );
}
