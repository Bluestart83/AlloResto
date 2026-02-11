"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { ROLE_ADMIN } from "@/lib/roles";

interface SidebarProps {
  restaurantId?: string;
  restaurantName?: string;
}

export default function Sidebar({ restaurantId, restaurantName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === ROLE_ADMIN;

  const baseItems = [
    { href: "/admin/customers", icon: "bi-people", label: "Clients" },
    { href: "/admin/import", icon: "bi-cloud-download", label: "Import resto" },
    { href: "/admin/servers", icon: "bi-hdd-rack", label: "Serveurs Vocaux" },
    { href: "/admin/pricing", icon: "bi-currency-dollar", label: "Tarification" },
  ];

  const restaurantItems = restaurantId
    ? [
        { href: `/place/${restaurantId}/dashboard`, icon: "bi-speedometer2", label: "Dashboard" },
        { href: `/place/${restaurantId}/dashboard-demo`, icon: "bi-speedometer2", label: "Dashboard (Demo)" },
        { href: `/place/${restaurantId}/planning`, icon: "bi-kanban", label: "Planning" },
        { href: `/place/${restaurantId}/orders`, icon: "bi-bag-check", label: "Commandes" },
        { href: `/place/${restaurantId}/livraisons`, icon: "bi-truck", label: "Livraisons" },
        { href: `/place/${restaurantId}/reservations`, icon: "bi-calendar-check", label: "Reservations" },
        { href: `/place/${restaurantId}/salles`, icon: "bi-door-open", label: "Salles & Tables" },
        { href: `/place/${restaurantId}/services`, icon: "bi-clock-history", label: "Services" },
        { href: `/place/${restaurantId}/messages`, icon: "bi-envelope", label: "Messages" },
        { href: `/place/${restaurantId}/calls`, icon: "bi-telephone", label: "Appels" },
        { href: `/place/${restaurantId}/menu`, icon: "bi-book", label: "Menu" },
        { href: `/place/${restaurantId}/formules`, icon: "bi-collection", label: "Formules" },
        { href: `/place/${restaurantId}/offres`, icon: "bi-gift", label: "Offres" },
        { href: `/place/${restaurantId}/faq`, icon: "bi-question-circle", label: "FAQ" },
      ]
    : [];

  const isActive = (href: string) => {
    // Exact match for dashboard to avoid /dashboard matching /dashboard-demo
    if (restaurantId && (href === `/place/${restaurantId}/dashboard` || href === `/place/${restaurantId}/dashboard-demo`)) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  function handleLogout() {
    signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  }

  return (
    <div className="sidebar d-flex flex-column">
      {/* Logo */}
      <div className="px-3 py-4 border-bottom border-dark">
        <Link href={isAdmin ? "/admin/customers" : "/"} className="text-decoration-none">
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
        </Link>
      </div>

      {/* Status */}
      {restaurantId && (
        <div className="px-3 py-2">
          <div
            className="d-flex align-items-center gap-2 px-3 py-2 rounded-3"
            style={{ backgroundColor: "rgba(16,185,129,0.1)" }}
          >
            <span className="live-dot"></span>
            <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 500 }}>
              IA Active
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-grow-1 py-2">
        {restaurantId && (
          <>
            <div className="px-3 mb-1">
              <small className="text-secondary text-uppercase" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                Restaurant
              </small>
            </div>
            <ul className="nav flex-column mb-3">
              {restaurantItems.map((item) => (
                <li className="nav-item" key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-link d-flex align-items-center ${isActive(item.href) ? "active" : ""}`}
                  >
                    <i className={`bi ${item.icon}`}></i>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <hr className="border-dark mx-3 my-1" />
          </>
        )}
        {isAdmin && (
          <>
            <div className="px-3 mb-1 mt-2">
              <small className="text-secondary text-uppercase" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                Admin
              </small>
            </div>
            <ul className="nav flex-column">
              {baseItems.map((item) => (
                <li className="nav-item" key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-link d-flex align-items-center ${isActive(item.href) ? "active" : ""}`}
                  >
                    <i className={`bi ${item.icon}`}></i>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-top border-dark">
        {restaurantName && (
          <div className="text-secondary mb-1" style={{ fontSize: "0.7rem" }}>
            {restaurantName}
          </div>
        )}
        {session?.user && (
          <div className="text-secondary mb-2" style={{ fontSize: "0.7rem" }}>
            <i className="bi bi-person-circle me-1"></i>
            {session.user.name || session.user.email}
          </div>
        )}
        <Link
          href={restaurantId ? `/place/${restaurantId}/settings` : "/admin/settings"}
          className="nav-link px-0 py-1"
          style={{ fontSize: "0.8rem" }}
        >
          <i className="bi bi-gear me-1"></i>Paramètres
        </Link>
        <Link
          href="/account/password"
          className="nav-link px-0 py-1"
          style={{ fontSize: "0.8rem" }}
        >
          <i className="bi bi-key me-1"></i>Changer mot de passe
        </Link>
        <button
          onClick={handleLogout}
          className="nav-link px-0 py-1 border-0 bg-transparent text-start w-100"
          style={{ fontSize: "0.8rem", color: "#9ca3af" }}
        >
          <i className="bi bi-box-arrow-left me-1"></i>Déconnexion
        </button>
      </div>
    </div>
  );
}
