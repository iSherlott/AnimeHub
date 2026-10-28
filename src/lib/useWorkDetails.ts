"use client";

import { useEffect, useState } from "react";

/** Sinopse (original e traduções guardadas) e gêneros de uma obra, para a prévia — ver /api/catalog/preview. */
export type WorkDetails = { anilistId: number | null; description: string | null; descriptionPt: string | null; descriptionJa: string | null; genres: string[] };

// Uma busca por obra por visita: abrir a mesma prévia de novo (ou voltar a ela pelas setas) não pede de novo.
const cache = new Map<string, Promise<WorkDetails | null>>();

function load(key: string): Promise<WorkDetails | null> {
  let request = cache.get(key);
  if (!request) {
    request = fetch(`/api/catalog/preview?work=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? (r.json() as Promise<WorkDetails>) : null))
      .catch(() => null);
    cache.set(key, request);
    // Falhou: a próxima abertura tenta de novo.
    void request.then((value) => {
      if (!value) cache.delete(key);
    });
  }
  return request;
}

/**
 * Pede a sinopse e os gêneros de uma obra só quando a prévia dela abre (as listas — calendário, Explorar paginado,
 * Minha Lista, Feed — não carregam a sinopse de cada item). `key` é a chave do endereço da obra (o AniList ID ou
 * `anidb-<id>`/`kitsu-<id>`); nula = não precisa buscar.
 */
export function useWorkDetails(key: string | null): { details: WorkDetails | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; value: WorkDetails | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void load(key).then((value) => {
      if (!cancelled) setState({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (!key) return { details: null, loading: false };
  return state?.key === key ? { details: state.value, loading: false } : { details: null, loading: true };
}
