"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TitleLanguageMenu } from "@/components/TitleLanguageMenu";
import type { PublicUser } from "@/lib/auth/session";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header
      className={`sticky top-0 z-30 flex items-center gap-8 px-6 py-4 transition-colors duration-300 sm:px-10 ${
        scrolled
          ? "bg-ink/95 shadow-lg shadow-black/40 backdrop-blur-sm border-b border-border"
          : "bg-gradient-to-b from-black/90 via-black/40 to-transparent"
      }`}
    >
      <Link
        href="/"
        className="font-display text-2xl uppercase tracking-wide text-jump-red drop-shadow-[2px_2px_0_#000]"
      >
        Anime Hub
      </Link>
      <nav className="flex gap-6 text-sm font-semibold uppercase tracking-wide">
        <Link
          href="/"
          className={`transition hover:text-text-primary ${
            pathname === "/" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Minha lista
        </Link>
        <Link
          href="/discover"
          className={`transition hover:text-text-primary ${
            pathname === "/discover" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Descobrir
        </Link>
        <Link
          href="/calendar"
          className={`transition hover:text-text-primary ${
            pathname === "/calendar" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Calendário
        </Link>
      </nav>
      <TitleLanguageMenu />
      <div className="ml-auto flex items-center gap-3 text-sm">
        {user === undefined ? null : user ? (
          <>
            <span className="hidden text-text-muted sm:inline">{user.displayName}</span>
            <button
              onClick={handleLogout}
              className="font-semibold uppercase tracking-wide text-text-muted transition hover:text-text-primary"
            >
              Sair
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="font-semibold uppercase tracking-wide text-text-muted transition hover:text-text-primary"
          >
            Entrar
          </Link>
        )}
      </div>
    </header>
  );
}
