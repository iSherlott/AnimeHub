import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { changeHistory, type ChangeRow } from "@/lib/changeLog";
import { loadActiveOverrides, overrideKey } from "@/lib/airingOverrides";
import { releaseState } from "@/lib/episodeState";

/**
 * Admin → Catálogo de obras → detalhe (Fase 3): tudo que o admin precisa para decidir sobre uma obra, numa leitura só —
 * a obra canônica, as cópias e o que diverge delas, a franquia, o resumo dos episódios, as pendências, o histórico.
 */
export type EpisodeSummary = {
  /** Total informado pela fonte (`CatalogEntry.episodes`); nulo = a fonte não informa. */
  informed: number | null;
  /** Calculado: episódios que o sistema tem (globais, com ou sem data). */
  registered: number;
  /** Calculado: já exibidos (data conhecida e passada, sem adiamento/cancelamento). */
  aired: number;
  /** Calculado: futuros com data conhecida (dia e hora, ou só o dia). */
  upcoming: number;
  /** Calculado: sem data conhecida ou adiados. */
  undated: number;
  cancelled: number;
  /** Com título / sinopse do episódio. */
  withTitle: number;
  withSynopsis: number;
  next: { episode: number; at: string; exact: boolean } | null;
  lastAired: { episode: number; at: string } | null;
  /** O informado e o cadastrado não batem (só quando a obra já terminou e a fonte informa o total). */
  divergence: string | null;
};

/** Resumo dos episódios da obra (Fase 4): o informado pela fonte separado do calculado pelo sistema; nada inventado. */
export async function episodeSummary(entry: Pick<CatalogEntry, "id" | "anilistId" | "episodes" | "status">, now: Date = new Date()): Promise<EpisodeSummary> {
  const byWork = { OR: [{ catalogEntryId: entry.id }, ...(entry.anilistId !== null ? [{ anilistId: entry.anilistId }] : [])] };
  const [raw, overrides] = await Promise.all([
    prisma.airingScheduleEntry.findMany({ where: byWork, select: { anilistId: true, episode: true, airingAt: true, airDate: true, status: true, episodeTitle: true, episodeTitleEn: true, episodeTitleJa: true, synopsis: true } }),
    entry.anilistId !== null ? loadActiveOverrides([entry.anilistId]) : Promise.resolve(new Map<string, Date>()),
  ]);
  // Horário efetivo: o override do admin vale sobre o da fonte.
  const rows = raw.map((r) => ({ ...r, airingAt: overrides.get(overrideKey(r.anilistId, r.episode)) ?? r.airingAt }));
  const states = rows.map((r) => ({ r, state: releaseState(r, now), at: r.airingAt ?? r.airDate }));
  const aired = states.filter((s) => s.state === "AIRED");
  const upcoming = states.filter((s) => s.state === "SCHEDULED" || s.state === "EXPECTED").sort((a, b) => (a.at as Date).getTime() - (b.at as Date).getTime());
  const last = [...aired].sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime())[0];
  const registered = rows.length;
  let divergence: string | null = null;
  if (entry.episodes !== null && registered > entry.episodes) divergence = `O sistema tem ${registered} episódios e a fonte informa ${entry.episodes}.`;
  else if (entry.status === "FINISHED" && entry.episodes !== null && registered > 0 && registered < entry.episodes) divergence = `Obra finalizada com ${entry.episodes} episódios informados, mas só ${registered} cadastrados.`;
  return {
    informed: entry.episodes,
    registered,
    aired: aired.length,
    upcoming: upcoming.length,
    undated: states.filter((s) => s.state === "UNKNOWN_DATE" || s.state === "POSTPONED").length,
    cancelled: states.filter((s) => s.state === "CANCELLED").length,
    withTitle: rows.filter((r) => r.episodeTitle || r.episodeTitleEn || r.episodeTitleJa).length,
    withSynopsis: rows.filter((r) => r.synopsis).length,
    next: upcoming[0] ? { episode: upcoming[0].r.episode, at: (upcoming[0].at as Date).toISOString(), exact: upcoming[0].r.airingAt !== null } : null,
    lastAired: last ? { episode: last.r.episode, at: (last.at as Date).toISOString() } : null,
    divergence,
  };
}

/** Campos copiados que divergem da obra (por cópia), para o admin ver o que a propagação ainda não alinhou. */
const COMPARED = ["titleRomaji", "titleNative", "episodes", "status", "season", "seasonYear", "format", "genres", "coverImage"] as const;

export type WorkDetail = {
  entry: CatalogEntry;
  productions: Array<{ id: string; anilistId: number; franchiseId: string; franchiseName: string; seasonNumber: number; diverging: string[] }>;
  followers: number;
  listDiverging: Record<string, number>;
  franchise: Array<{ id: string; anilistId: number | null; titleRomaji: string; titleNative: string | null; kind: string | null; seasonYear: number | null; timelineOrder: number | null; timelineRole: string | null; timelineSeason: number | null }>;
  story: Array<{ kind: string; role: "REBOOT" | "ORIGINAL"; other: { id: string | null; anilistId: number; title: string } }>;
  episodes: EpisodeSummary;
  issues: Array<{ id: string; code: string; detail: string | null; status: string; updatedAt: string }>;
  overrides: number;
  translations: Array<{ lang: string; source: string; updatedAt: string }>;
  history: { rows: ChangeRow[]; total: number };
};

export async function loadWorkDetail(id: string, historyPage = 0): Promise<WorkDetail | null> {
  const entry = await prisma.catalogEntry.findUnique({ where: { id } });
  if (!entry) return null;
  const byWork = { OR: [{ catalogEntryId: id }, ...(entry.anilistId !== null ? [{ anilistId: entry.anilistId }] : [])] };
  const [productions, followers, listRows, franchise, links, episodes, issues, overrides, translations, history] = await Promise.all([
    prisma.production.findMany({ where: byWork, include: { franchise: { select: { id: true, name: true } } } }),
    prisma.anime.count({ where: byWork }),
    prisma.anime.findMany({ where: byWork, select: { titleRomaji: true, titleNative: true, episodes: true, status: true, season: true, seasonYear: true, format: true, genres: true, coverImage: true } }),
    entry.franchiseKey !== null
      ? prisma.catalogEntry.findMany({ where: { franchiseKey: entry.franchiseKey, onPlatform: true }, orderBy: [{ timelineOrder: "asc" }, { titleRomaji: "asc" }], select: { id: true, anilistId: true, titleRomaji: true, titleNative: true, kind: true, seasonYear: true, timelineOrder: true, timelineRole: true, timelineSeason: true } })
      : Promise.resolve([]),
    entry.anilistId !== null ? prisma.storyLink.findMany({ where: { OR: [{ oldAnilistId: entry.anilistId }, { newAnilistId: entry.anilistId }] } }) : Promise.resolve([]),
    episodeSummary(entry),
    prisma.curationIssue.findMany({ where: { entryId: id }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] }),
    entry.anilistId !== null ? prisma.catalogOverride.count({ where: { anilistId: entry.anilistId, removedAt: null } }) : Promise.resolve(0),
    entry.anilistId !== null ? prisma.synopsisTranslation.findMany({ where: { anilistId: entry.anilistId }, select: { lang: true, source: true, updatedAt: true } }) : Promise.resolve([]),
    changeHistory({ catalogEntryId: id }, historyPage, 30),
  ]);
  const differs = (copy: Record<string, unknown>) => COMPARED.filter((f) => (entry as Record<string, unknown>)[f] !== null && JSON.stringify(copy[f] ?? null) !== JSON.stringify((entry as Record<string, unknown>)[f]));
  const listDiverging: Record<string, number> = {};
  for (const row of listRows) for (const f of differs(row as Record<string, unknown>)) listDiverging[f] = (listDiverging[f] ?? 0) + 1;
  const otherIds = links.map((l) => (l.oldAnilistId === entry.anilistId ? l.newAnilistId : l.oldAnilistId));
  const others = new Map((await prisma.catalogEntry.findMany({ where: { anilistId: { in: otherIds } }, select: { id: true, anilistId: true, titleRomaji: true } })).map((o) => [o.anilistId as number, o]));
  return {
    entry,
    productions: productions.map((p) => ({ id: p.id, anilistId: p.anilistId, franchiseId: p.franchise.id, franchiseName: p.franchise.name, seasonNumber: p.seasonNumber, diverging: differs(p as unknown as Record<string, unknown>) })),
    followers,
    listDiverging,
    franchise,
    story: links.map((l) => {
      const otherId = l.oldAnilistId === entry.anilistId ? l.newAnilistId : l.oldAnilistId;
      const other = others.get(otherId);
      return { kind: l.kind, role: l.newAnilistId === entry.anilistId ? "REBOOT" : "ORIGINAL", other: { id: other?.id ?? null, anilistId: otherId, title: other?.titleRomaji ?? `AniList #${otherId}` } };
    }),
    episodes,
    issues: issues.map((i) => ({ id: i.id, code: i.code, detail: i.detail, status: i.status, updatedAt: i.updatedAt.toISOString() })),
    overrides,
    translations: translations.map((t) => ({ lang: t.lang, source: t.source, updatedAt: t.updatedAt.toISOString() })),
    history,
  };
}
