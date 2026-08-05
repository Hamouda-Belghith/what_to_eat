"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSignOut } from "@/features/auth/AuthContext";

const LINKS = [
  { href: "/", label: "Planning", emoji: "📅" },
  { href: "/plats", label: "Plats", emoji: "🍽️" },
  { href: "/courses", label: "Courses", emoji: "🛒" },
];

export function Nav() {
  const pathname = usePathname();
  const signOut = useSignOut();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-links">
          {LINKS.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${isActive ? "active" : ""}`}
              >
                <span>{link.emoji}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void signOut()}
        >
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
