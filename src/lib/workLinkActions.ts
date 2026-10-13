import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { logEvent, type AdminActor } from "@/lib/adminImport/pipeline";
import { backfillEarlierSeasons, syncContinuations } from "@/lib/continuation";
import { seasonLabel, type SeasonName } from "@/lib/exploreGroups";
import { ensureProduction } from "@/lib/production";
import { suggestContinuations, type SuggestWork } from "@/lib/workLinkSuggest";
import { mergeLinkedFranchises, undoWorkLink } from "@/lib/workLinks";

/** Uma obra como o painel Match name a mostra. */
export type LinkWork = { anilistId: number; title: string; coverImage: string | null; seasonLabel: string | null };
export type SuggestionView = { earlier: LinkWork; later: LinkWork; reason: string };
export type LinkView = { id: string; status: "CONFIRMED" | "REJECTED"; origin: string; earlier: LinkWork; later: LinkWork; decidedByName: string | null; canUndo: boolean };
export type WorkLinkPanel = { suggestions: SuggestionView[]; confirmed: LinkView[]; rejected: LinkView[] };

type Row = { anilistId: number | null; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; season: string | null; seasonYear: number | null };

function toLinkWork(row: Row | undefined, anilistId: number): LinkWork {
  if (!row) return { anilistId, title: `Obra #${anilistId}`, coverImage: null, seasonLabel: null };
  const label = row.season && row.seasonYear ? seasonLabel({ season: row.season as SeasonName, year: row.seasonYear }) : null;
  return { anilistId, title: row.titleRomaji, coverImage: row.coverImage, seasonLabel: label };
}

async function worksById(ids: number[]): Promise<Map<number, Row>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.catalogEntry.findMany({
    where: { anilistId: { in: ids } },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, season: true, seasonYear: true },
  });
  const map = new Map(rows.map((r) => [r.anilistId as number, r]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const productions = await prisma.production.findMany({
      where: { anilistId: { in: missing } },
      select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, season: true, seasonYear: true },
    });
    for (const p of productions) map.set(p.anilistId, p);
  }
  return map;
}

/** As obras da plataforma que podem aparecer nas sugestões (com página, sem conteúdo adulto, com temporada). */
async function suggestionWorks(): Promise<SuggestWork[]> {
  const entries = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, anilistId: { not: null }, season: { not: null }, seasonYear: { not: null }, ...NOT_BLOCKED_GENRE },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, season: true, seasonYear: true },
  });
  const productions = await prisma.production.findMany({
    where: { anilistId: { in: entries.map((e) => e.anilistId as number) } },
    select: { anilistId: true, franchiseId: true },
  });
  const franchise = new Map(productions.map((p) => [p.anilistId, p.franchiseId]));
  return entries.map((e) => ({
    anilistId: e.anilistId as number,
    titleRomaji: e.titleRomaji,
    titleEnglish: e.titleEnglish,
    season: e.season,
    seasonYear: e.seasonYear,
    franchiseId: franchise.get(e.anilistId as number) ?? null,
  }));
}

/** Tudo o que a tela Match name precisa: o que parece continuação e ainda não foi decidido, e o que já foi decidido. */
export async function loadWorkLinkPanel(): Promise<WorkLinkPanel> {
  const links = await prisma.workLink.findMany({ orderBy: { updatedAt: "desc" } });
  const decided = new Set(links.map((l) => `${l.earlierAnilistId}:${l.laterAnilistId}`));
  const works = await suggestionWorks();
  const suggestions = suggestContinuations(works, decided);

  const ids = new Set<number>();
  for (const l of links) {
    ids.add(l.earlierAnilistId);
    ids.add(l.laterAnilistId);
  }
  const rows = await worksById(Array.from(ids));
  const catalog = await prisma.catalogEntry.findMany({
    where: { anilistId: { in: suggestions.flatMap((s) => [s.earlier.anilistId, s.later.anilistId]) } },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, season: true, seasonYear: true },
  });
  const catalogById = new Map(catalog.map((r) => [r.anilistId as number, r]));

  const view = (l: (typeof links)[number]): LinkView => ({
    id: l.id,
    status: l.status as "CONFIRMED" | "REJECTED",
    origin: l.origin,
    earlier: toLinkWork(rows.get(l.earlierAnilistId), l.earlierAnilistId),
    later: toLinkWork(rows.get(l.laterAnilistId), l.laterAnilistId),
    decidedByName: l.decidedByName,
    canUndo: true,
  });
  return {
    suggestions: suggestions.map((s) => ({
      earlier: toLinkWork(catalogById.get(s.earlier.anilistId), s.earlier.anilistId),
      later: toLinkWork(catalogById.get(s.later.anilistId), s.later.anilistId),
      reason: s.reason,
    })),
    confirmed: links.filter((l) => l.status === "CONFIRMED").map(view),
    rejected: links.filter((l) => l.status === "REJECTED").map(view),
  };
}

/** Busca por nome para a junção manual: só obras da plataforma, que têm página. */
export async function searchLinkableWorks(query: string): Promise<LinkWork[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.catalogEntry.findMany({
    where: {
      onPlatform: true,
      anilistId: { not: null },
      ...NOT_BLOCKED_GENRE,
      OR: [{ titleRomaji: { contains: q, mode: "insensitive" } }, { titleEnglish: { contains: q, mode: "insensitive" } }, { titleNative: { contains: q, mode: "insensitive" } }],
    },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, season: true, seasonYear: true },
    orderBy: [{ seasonYear: "desc" }, { titleRomaji: "asc" }],
    take: 12,
  });
  return rows.map((r) => toLinkWork(r, r.anilistId as number));
}

export type WorkLinkResult = { ok: true } | { ok: false; status: number; error: string };
export type WorkLinkInput = { earlierAnilistId: number; laterAnilistId: number; decision: "confirm" | "reject"; origin: "SUGGESTED" | "MANUAL" };

export async function decideWorkLink(input: WorkLinkInput, actor: AdminActor): Promise<WorkLinkResult> {
  const { earlierAnilistId, laterAnilistId } = input;
  if (earlierAnilistId === laterAnilistId) return { ok: false, status: 422, error: "Escolha duas obras diferentes." };
  const opposite = await prisma.workLink.findUnique({ where: { earlierAnilistId_laterAnilistId: { earlierAnilistId: laterAnilistId, laterAnilistId: earlierAnilistId } } });
  const current = await prisma.workLink.findUnique({ where: { earlierAnilistId_laterAnilistId: { earlierAnilistId, laterAnilistId } } });
  const titles = await worksById([earlierAnilistId, laterAnilistId]);
  const nameOf = (id: number) => titles.get(id)?.titleRomaji ?? `#${id}`;

  if (input.decision === "reject") {
    if (current?.status === "CONFIRMED") return { ok: false, status: 409, error: "Esta ligação já foi confirmada. Desfaça antes de recusar." };
    await prisma.workLink.upsert({
      where: { earlierAnilistId_laterAnilistId: { earlierAnilistId, laterAnilistId } },
      create: { earlierAnilistId, laterAnilistId, status: "REJECTED", origin: input.origin, decidedByName: actor.name },
      update: { status: "REJECTED", decidedByName: actor.name },
    });
    await logEvent({ source: "Match name", event: "Continuation rejected", message: `${nameOf(laterAnilistId)} não é continuação de ${nameOf(earlierAnilistId)}.`, context: `AniList #${earlierAnilistId} → #${laterAnilistId}`, actor });
    return { ok: true };
  }

  if (opposite?.status === "CONFIRMED") return { ok: false, status: 409, error: "As duas obras já estão ligadas no sentido contrário." };
  const [earlier, later] = await Promise.all([ensureProduction(earlierAnilistId).catch(() => null), ensureProduction(laterAnilistId).catch(() => null)]);
  if (!earlier || !later) return { ok: false, status: 422, error: "Uma das obras ainda não tem página na plataforma. Traga-a pela importação antes de ligar." };

  const link = await prisma.workLink.upsert({
    where: { earlierAnilistId_laterAnilistId: { earlierAnilistId, laterAnilistId } },
    create: { earlierAnilistId, laterAnilistId, status: "CONFIRMED", origin: input.origin, decidedByName: actor.name },
    update: { status: "CONFIRMED", origin: input.origin, decidedByName: actor.name },
  });
  await mergeLinkedFranchises(link);
  await logEvent({ source: "Match name", event: "Continuation confirmed", message: `${nameOf(laterAnilistId)} confirmada como continuação de ${nameOf(earlierAnilistId)}.`, context: `AniList #${earlierAnilistId} → #${laterAnilistId}`, actor });
  // Quem acompanha a anterior passa a acompanhar a nova (e ganha a anterior como "terminei"); sem travar a resposta.
  void syncContinuations()
    .then(() => backfillEarlierSeasons())
    .catch((error: unknown) => console.error("[work-link] sincronizar continuação falhou:", error));
  return { ok: true };
}

export async function removeWorkLink(id: string, actor: AdminActor): Promise<WorkLinkResult> {
  const link = await prisma.workLink.findUnique({ where: { id } });
  if (!link) return { ok: false, status: 404, error: "Ligação não encontrada." };
  await undoWorkLink(id);
  await logEvent({ source: "Match name", level: "WARN", event: link.status === "CONFIRMED" ? "Continuation undone" : "Rejection undone", message: `Decisão desfeita para as obras #${link.earlierAnilistId} e #${link.laterAnilistId}.`, context: `AniList #${link.earlierAnilistId} → #${link.laterAnilistId}`, actor });
  return { ok: true };
}
