"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@/lib/auth/session";

type CurrentUser = PublicUser | null | undefined;

/** `undefined` enquanto carrega, `null` se não estiver logado. */
const CurrentUserContext = createContext<CurrentUser>(undefined);
const SetCurrentUserContext = createContext<(user: CurrentUser) => void>(() => {});

/**
 * Busca `/api/auth/me` uma única vez por navegação pra árvore inteira
 * (montado no RootLayout) — antes, cada `useCurrentUser()` (Header, cada
 * DiscoverCard da tela, Calendário) disparava sua própria requisição
 * independente; numa tela de Descobrir com dezenas de cards isso virava
 * dezenas de chamadas idênticas (achado real da 2ª auditoria de UX/UI,
 * Epic 20). Refaz a busca a cada troca de rota — mesmo gatilho que o
 * Header já usava sozinho, preservado aqui pra continuar refletindo
 * login/logout ao navegar sem precisar recarregar a página.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser>(undefined);

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

  return (
    <CurrentUserContext.Provider value={user}>
      <SetCurrentUserContext.Provider value={setUser}>{children}</SetCurrentUserContext.Provider>
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser {
  return useContext(CurrentUserContext);
}

/** Pra atualizar o usuário compartilhado na hora (ex.: logout), sem esperar
 * a próxima troca de rota refazer a busca sozinha. */
export function useSetCurrentUser(): (user: CurrentUser) => void {
  return useContext(SetCurrentUserContext);
}
