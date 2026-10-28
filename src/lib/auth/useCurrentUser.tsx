"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/auth/session";
import { isMemberOnlyPath } from "@/lib/memberOnly";
import { loginHref } from "@/lib/safeRedirect";

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
 *
 * `initialUser` vem do servidor (RootLayout lê a sessão): a página já nasce sabendo quem está olhando. Antes, toda tela
 * que depende da pessoa esperava o JavaScript montar e o `/api/auth/me` voltar para só então pedir os próprios dados —
 * uma ida e volta a mais no celular — e o cabeçalho piscava "deslogado".
 */
export function CurrentUserProvider({ children, initialUser }: { children: ReactNode; initialUser?: PublicUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>(initialUser);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  });

  // Na primeira montagem com o usuário vindo do servidor não precisa perguntar de novo.
  const skipFirstCheck = useRef(initialUser !== undefined);
  useEffect(() => {
    if (skipFirstCheck.current) {
      skipFirstCheck.current = false;
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // Mesma pessoa, mesmos dados: mantém o objeto — telas que dependem de `user` não buscam tudo de novo.
        setUser((prev) => (prev && data.user && JSON.stringify(prev) === JSON.stringify(data.user) ? prev : data.user));
        // Sessão que venceu numa página só de quem tem conta: vai ao login (que devolve a pessoa para cá).
        if (!data.user && isMemberOnlyPath(window.location.pathname)) router.replace(loginHref(`${window.location.pathname}${window.location.search}`));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
    // `router` é estável; a checagem é por troca de rota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Senha provisória (conta criada ou senha redefinida pelo admin): nada abre até a pessoa escolher a dela.
  const mustChangePassword = Boolean(user?.mustChangePassword);
  useEffect(() => {
    if (mustChangePassword && pathname !== "/trocar-senha") router.replace(`/trocar-senha?next=${encodeURIComponent(pathname)}`);
  }, [mustChangePassword, pathname, router]);

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
          if (isMemberOnlyPath(window.location.pathname)) router.replace(loginHref(`${window.location.pathname}${window.location.search}`));
          else router.refresh();
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
