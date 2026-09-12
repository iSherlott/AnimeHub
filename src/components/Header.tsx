"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TitleLanguageMenu } from "@/components/TitleLanguageMenu";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    </header>
  );
}
