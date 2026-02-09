"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", icon: "bi-speedometer2", label: "Dashboard" },
  { href: "/dashboard/orders", icon: "bi-bag-check", label: "Commandes" },
  { href: "/dashboard/calls", icon: "bi-telephone", label: "Appels" },
  { href: "/dashboard/menu", icon: "bi-book", label: "Menu" },
  { href: "/dashboard/faq", icon: "bi-question-circle", label: "FAQ" },
  { href: "/dashboard/customers", icon: "bi-people", label: "Clients" },
  { href: "/import", icon: "bi-cloud-download", label: "Import resto" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="sidebar d-flex flex-column">
      {/* Logo */}
      <div className="px-3 py-4 border-bottom border-dark">
        <div className="d-flex align-items-center gap-2">
          <div
            className="d-flex align-items-center justify-content-center rounded-3"
            style={{ width: 36, height: 36, backgroundColor: "var(--vo-primary)" }}
          >
            <i className="bi bi-telephone-fill text-white"></i>
          </div>
          <div>
            <div className="text-white fw-bold" style={{ fontSize: "0.95rem" }}>
              VoiceOrder AI
            </div>
            <div className="text-secondary" style={{ fontSize: "0.7rem" }}>
              Dashboard
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="px-3 py-2">
        <div className="d-flex align-items-center gap-2 px-3 py-2 rounded-3"
          style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
          <span className="live-dot"></span>
          <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 500 }}>
            IA Active
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-grow-1 py-2">
        <ul className="nav flex-column">
          {navItems.map((item) => (
            <li className="nav-item" key={item.href}>
              <Link
                href={item.href}
                className={`nav-link d-flex align-items-center ${
                  pathname === item.href ? "active" : ""
                }`}
              >
                <i className={`bi ${item.icon}`}></i>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-top border-dark">
        <div className="text-secondary" style={{ fontSize: "0.7rem" }}>
          Pizzeria Bella Napoli
        </div>
        <Link href="/dashboard/settings" className="nav-link px-0 py-1"
          style={{ fontSize: "0.8rem" }}>
          <i className="bi bi-gear me-1"></i>Paramètres
        </Link>
      </div>
    </div>
  );
}
