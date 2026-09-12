"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TitleLanguageMenu } from "@/components/TitleLanguageMenu";
import type { PublicUser } from "@/lib/auth/session";

function NavLinks({
  pathname,
  user,
  onNavigate,
}: {
  pathname: string;
  user: PublicUser | null | undefined;
  onNavigate?: () => void;
}) {
  return (
    <>
      {user && (
        <Link
          href="/"
          onClick={onNavigate}
          className={`transition hover:text-text-primary ${
            pathname === "/" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Minha lista
        </Link>
      )}
      <Link
        href="/discover"
        onClick={onNavigate}
        className={`transition hover:text-text-primary ${
          pathname === "/discover" ? "text-text-primary" : "text-text-muted"
        }`}
      >
        Descobrir
      </Link>
      <Link
        href="/calendar"
        onClick={onNavigate}
        className={`transition hover:text-text-primary ${
          pathname === "/calendar" ? "text-text-primary" : "text-text-muted"
        }`}
      >
        Calendário
      </Link>
      {user?.role === "ADMIN" && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className={`transition hover:text-text-primary ${
            pathname === "/admin" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Administração
        </Link>
      )}
    </>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // Fecha o menu mobile sempre que a rota muda.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMobileOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "bg-ink/95 shadow-lg shadow-black/40 backdrop-blur-sm border-b border-border"
          : "bg-gradient-to-b from-black/90 via-black/40 to-transparent"
      }`}
    >
      <div className="flex items-center gap-8 px-6 py-4 sm:px-10">
        <Link
          href="/"
          className="font-display text-2xl uppercase tracking-wide text-jump-red drop-shadow-[2px_2px_0_#000]"
        >
          Anime Hub
        </Link>

        <nav className="hidden gap-6 text-sm font-semibold uppercase tracking-wide sm:flex">
          <NavLinks pathname={pathname} user={user} />
        </nav>

        <div className="ml-auto hidden items-center gap-3 text-sm sm:flex">
          <TitleLanguageMenu />
          {user === undefined ? null : user ? (
            <>
              <span className="hidden text-text-muted md:inline">{user.displayName}</span>
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

        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="ml-auto flex h-9 w-9 items-center justify-center border border-border bg-surface text-text-body sm:hidden"
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
            {mobileOpen ? (
              <path d="M6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6Z" />
            ) : (
              <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-4 border-t border-border bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-wide sm:hidden">
          <NavLinks pathname={pathname} user={user} onNavigate={() => setMobileOpen(false)} />
          <div className="flex items-center justify-between border-t border-border pt-4">
            <TitleLanguageMenu />
            {user === undefined ? null : user ? (
              <div className="flex items-center gap-3">
                <span className="text-text-muted">{user.displayName}</span>
                <button
                  onClick={handleLogout}
                  className="text-text-muted transition hover:text-text-primary"
                >
                  Sair
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="text-text-muted transition hover:text-text-primary"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
