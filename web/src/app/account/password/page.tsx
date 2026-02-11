import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const metadata = {
  title: "Changer le mot de passe — VoiceOrder AI",
};

export default async function ChangePasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div className="text-center mb-4">
          <h4 className="fw-bold">Changer le mot de passe</h4>
          <p className="text-muted">{session.user.email}</p>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
