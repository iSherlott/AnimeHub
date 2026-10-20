"use client";

import { useCallback, useState } from "react";

/** Quantas linhas/cartões aparecem de cada vez nas listas de animes (cabe em 2-3 telas, sem pesar o DOM). */
export const DEFAULT_WINDOW = 48;

/**
 * Rolagem infinita para uma lista que JÁ está na memória: mostra só os primeiros `pageSize` itens e libera mais a cada
 * `loadMore` (chamado pelo sentinela de `useInfiniteScroll`). Quando `resetKey` muda (outro filtro, outra busca) a janela
 * volta ao começo — sem efeito: a contagem guardada só vale para a chave com que foi gravada. `expandTo(n)` garante que
 * pelo menos `n` itens estejam à mostra (ex.: levar a pessoa a um comentário indicado por âncora).
 */
export function useWindowedList<T>(items: readonly T[], resetKey: string, pageSize: number = DEFAULT_WINDOW) {
  const [state, setState] = useState({ key: resetKey, count: pageSize });
  const count = state.key === resetKey ? state.count : pageSize;
  const loadMore = useCallback(() => {
    setState((s) => ({ key: resetKey, count: (s.key === resetKey ? s.count : pageSize) + pageSize }));
  }, [resetKey, pageSize]);
  const expandTo = useCallback(
    (wanted: number) => {
      setState((s) => ({ key: resetKey, count: Math.max(s.key === resetKey ? s.count : pageSize, wanted) }));
    },
    [resetKey, pageSize]
  );
  const shown = Math.min(count, items.length);
  return { visible: items.slice(0, shown), shown, total: items.length, hasMore: shown < items.length, loadMore, expandTo };
}
