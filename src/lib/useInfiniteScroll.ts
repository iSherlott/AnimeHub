"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rolagem infinita (feed de rede social): devolve uma `ref` para um elemento
 * sentinela no fim da lista; quando ele chega perto da tela (600 px antes),
 * chama `onMore`. Sem IntersectionObserver (navegador antigo, teste sem
 * suporte) `supported` vem `false` e quem usa mostra o botão "Ver mais".
 */
export function useInfiniteScroll(onMore: () => void, enabled: boolean, watch: unknown = null) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const latest = useRef(onMore);
  useEffect(() => {
    latest.current = onMore;
  });
  const supported = typeof window === "undefined" || "IntersectionObserver" in window;

  useEffect(() => {
    if (!node || !enabled || !supported) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `watch` (ex.: nº de itens) recria o observador: se a página nova ainda deixa o sentinela à vista, ele dispara de novo.
  }, [node, enabled, supported, watch]);

  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);
  return { ref, supported };
}
