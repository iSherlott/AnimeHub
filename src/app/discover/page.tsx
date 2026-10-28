import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { loadCatalogFacets, loadCatalogPage } from "@/lib/catalogServer";
import { catalogQueryString, EMPTY_KEYWORDS } from "@/lib/catalogQuery";
import { loadAiringToday, loadStories } from "@/lib/exploreSections";
import { resolveTimeZone } from "@/lib/timeZone";
import { DiscoverExplorer, type ExploreInitial } from "./DiscoverExplorer";

/** Falhou no servidor: a tela busca sozinha, como antes. */
const orNull = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);

/**
 * Explorar renderizado no servidor: as fileiras ("No ar hoje", "Novas histórias"), os filtros e — quando o endereço já
 * abre num gênero (`?genre=`, dos chips da página da obra) — a primeira página do catálogo vêm prontas no HTML. Antes, a
 * tela esperava o JavaScript montar para só então pedir tudo isso. O fuso é o da conta; com "fuso do aparelho" (que só o
 * navegador sabe) a tela refaz as fileiras.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const param = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  const timeZone = resolveTimeZone(user?.timeZone ?? null);

  // Com `?genre=` (e sem busca) a tela abre no modo filtro: a primeira página tem a mesma identidade que a tela monta.
  const genre = param("genre");
  const catalogKey = genre && param("search").trim().length < 2 ? catalogQueryString({ q: "", genre, status: "", season: "", year: "", kind: "", availability: "", sort: "popular", keywords: EMPTY_KEYWORDS }) : null;

  const [today, stories, facets, catalogPage] = await Promise.all([
    orNull(loadAiringToday(timeZone, userId)),
    orNull(loadStories({ userId, recentIds: [] })),
    orNull(loadCatalogFacets()),
    catalogKey ? orNull(loadCatalogPage(new URLSearchParams(catalogKey), userId)) : Promise.resolve(null),
  ]);

  const initial: ExploreInitial = {
    timeZone,
    rows: today && stories ? { today, stories, personalized: Boolean(user) } : null,
    facets,
    catalog: catalogKey && catalogPage ? { key: catalogKey, page: catalogPage } : null,
  };
  // Pelo JSON: datas e afins no mesmo formato que as rotas entregam.
  return (
    <Suspense fallback={null}>
      <DiscoverExplorer initial={JSON.parse(JSON.stringify(initial)) as ExploreInitial} />
    </Suspense>
  );
}
