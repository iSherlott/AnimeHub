"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

export type PageResult<T> = { items: T[]; nextCursor: string | null; total?: number };

type State<T> = { items: T[]; cursor: string | null; hasMore: boolean; total: number | null; loading: boolean; loadingMore: boolean; failed: boolean };
type Action<T> =
  | { type: "reset" }
  | { type: "first"; page: PageResult<T> }
  | { type: "more"; page: PageResult<T> }
  | { type: "moreStart" }
  | { type: "fail"; first: boolean }
  | { type: "set"; items: T[] };

const initial = <T,>(): State<T> => ({ items: [], cursor: null, hasMore: false, total: null, loading: true, loadingMore: false, failed: false });

function merge<T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(current.map(keyOf));
  return [...current, ...incoming.filter((item) => !seen.has(keyOf(item)))];
}

/**
 * Rolagem infinita com os dados vindo do servidor, página a página (cursor opaco). `resetKey` identifica a consulta
 * (filtros + busca): quando muda, a lista volta ao começo e a primeira página é buscada de novo; respostas atrasadas de
 * uma consulta anterior são descartadas. Itens repetidos entre páginas (a lista mudou no meio) são ignorados.
 */
export function usePagedList<T>({
  resetKey,
  fetchPage,
  keyOf,
  enabled = true,
  initialPage,
}: {
  resetKey: string;
  fetchPage: (cursor: string | null) => Promise<PageResult<T>>;
  keyOf: (item: T) => string;
  enabled?: boolean;
  /** Primeira página que já veio pronta do servidor, para a consulta `key`: vale só se a tela abrir nessa mesma consulta. */
  initialPage?: { key: string; page: PageResult<T> } | null;
}) {
  const seeded = initialPage && enabled && initialPage.key === resetKey ? initialPage.page : null;
  const [state, dispatch] = useReducer(
    (s: State<T>, a: Action<T>): State<T> => {
      switch (a.type) {
        case "reset":
          return initial<T>();
        case "first":
          return { items: a.page.items, cursor: a.page.nextCursor, hasMore: a.page.nextCursor !== null, total: a.page.total ?? null, loading: false, loadingMore: false, failed: false };
        case "moreStart":
          return { ...s, loadingMore: true, failed: false };
        case "more":
          return { ...s, items: merge(s.items, a.page.items, keyOf), cursor: a.page.nextCursor, hasMore: a.page.nextCursor !== null, total: a.page.total ?? s.total, loadingMore: false, failed: false };
        case "fail":
          return { ...s, loading: a.first ? false : s.loading, loadingMore: false, failed: true };
        case "set":
          return { ...s, items: a.items };
      }
    },
    seeded,
    (page): State<T> => (page ? { items: page.items, cursor: page.nextCursor, hasMore: page.nextCursor !== null, total: page.total ?? null, loading: false, loadingMore: false, failed: false } : initial<T>())
  );
  // A primeira página do servidor dispensa a primeira busca (só a primeira: mudou a consulta, busca normalmente).
  const skipFirstLoad = useRef(Boolean(seeded));

  const fetchRef = useRef(fetchPage);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  const loadFirst = useCallback(() => {
    const mine = ++generation.current;
    busy.current = false;
    dispatch({ type: "reset" });
    fetchRef
      .current(null)
      .then((page) => {
        if (generation.current === mine) dispatch({ type: "first", page });
      })
      .catch(() => {
        if (generation.current === mine) dispatch({ type: "fail", first: true });
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    loadFirst();
    // `resetKey` é a identidade da consulta: mudou, recomeça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, enabled]);

  const loadMore = useCallback(() => {
    if (busy.current || !state.hasMore || state.loading || state.loadingMore) return;
    busy.current = true;
    const mine = generation.current;
    dispatch({ type: "moreStart" });
    fetchRef
      .current(state.cursor)
      .then((page) => {
        if (generation.current === mine) dispatch({ type: "more", page });
      })
      .catch(() => {
        if (generation.current === mine) dispatch({ type: "fail", first: false });
      })
      .finally(() => {
        busy.current = false;
      });
  }, [state.cursor, state.hasMore, state.loading, state.loadingMore]);

  const retry = useCallback(() => {
    if (state.items.length === 0) loadFirst();
    else loadMore();
  }, [state.items.length, loadFirst, loadMore]);

  const setItems = useCallback((items: T[]) => dispatch({ type: "set", items }), []);

  return { items: state.items, total: state.total, hasMore: state.hasMore, loading: state.loading, loadingMore: state.loadingMore, failed: state.failed, loadMore, retry, setItems };
}
