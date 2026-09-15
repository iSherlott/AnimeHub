"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>(undefined);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  });

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

  // Detecta sessão invalidada (expirada, deslogada em outra aba, revogada
  // pelo admin) em QUALQUER requisição da árvore, não só na checagem
  // periódica acima. Sem isso, uma ação autenticada que volta 401 enquanto
  // a aba já estava aberta deixava o cabeçalho (ainda "logado", só
  // reavaliado a cada troca de rota) e o conteúdo da página (que algumas
  // ações já recarregam via router.refresh() mesmo em erro) em contradição
  // visível, só se corrigindo na próxima navegação de verdade — achado
  // real da 5ª rodada de auditoria (Epic 18). As rotas de /api/auth/*
  // ficam de fora: um 401 de login com senha errada não significa que uma
  // sessão válida caiu.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401 && userRef.current) {
        const input = args[0];
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (!url.includes("/api/auth/")) {
          setUser(null);
          router.refresh();
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

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
