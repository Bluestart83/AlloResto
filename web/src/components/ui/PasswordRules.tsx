"use client";

const rules = [
  { test: (pw: string) => pw.length >= 8, label: "8 caractères minimum" },
  { test: (pw: string) => /[A-Z]/.test(pw), label: "1 majuscule" },
  { test: (pw: string) => /[a-z]/.test(pw), label: "1 minuscule" },
  { test: (pw: string) => /\d/.test(pw), label: "1 chiffre" },
  { test: (pw: string) => /[^a-zA-Z0-9]/.test(pw), label: "1 caractère spécial" },
];

export function passwordIsValid(pw: string): boolean {
  return rules.every((r) => r.test(pw));
}

interface RulesProps {
  password: string;
}

export default function PasswordRules({ password }: RulesProps) {
  if (password.length === 0) return null;

  return (
    <ul className="list-unstyled mt-2 mb-0" style={{ fontSize: "0.78rem" }}>
      {rules.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={ok ? "text-success" : "text-danger"}>
            <i className={`bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1`}></i>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

interface MatchProps {
  password: string;
  confirm: string;
}

export function PasswordMatch({ password, confirm }: MatchProps) {
  if (confirm.length === 0) return null;

  const ok = password === confirm;
  return (
    <div className={`mt-2 ${ok ? "text-success" : "text-danger"}`} style={{ fontSize: "0.78rem" }}>
      <i className={`bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1`}></i>
      {ok ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}
    </div>
  );
}
