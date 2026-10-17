import { prisma } from "@/lib/prisma";
import { searchAnime } from "@/lib/anilist";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { logEvent, type AdminActor } from "@/lib/adminImport/pipeline";
import { linkAnidbEntryManually, type ManualLinkResult } from "@/lib/adminImport/relink";
import { seasonLabel, type SeasonName } from "@/lib/exploreGroups";

/**
 * Admin → Match name → "Obras sem página": as obras que só existem pelo AniDB (sem página) e que o religamento não conseguiu
 * ligar sozinho. O admin confirma a sugestão da AniList, recusa, ou escolhe outra obra pela busca.
 */
export const PAGE_SIZE = 25;

export type AnidbOnlyRow = {
  anidbId: number;
  title: string;
  titleNative: string | null;
  coverImage: string | null;
  seasonLabel: string | null;
  episodes: number | null;
  candidate: { anilistId: number; title: string; score: number; reason: string } | null;
};
export type AnidbOnlyPage = { tab: "suggested" | "none"; page: number; total: number; pages: number; rows: AnidbOnlyRow[]; counts: { suggested: number; none: number } };

const ONLY_ANIDB = { source: "anidb", anilistId: null, anidbId: { not: null }, onPlatform: true } as const;

function toRow(entry: { anidbId: number | null; titleRomaji: string; titleNative: string | null; coverImage: string | null; season: string | null; seasonYear: number | null; episodes: number | null }, candidate: AnidbOnlyRow["candidate"]): AnidbOnlyRow {
  return {
    anidbId: entry.anidbId as number,
    title: entry.titleRomaji,
    titleNative: entry.titleNative,
    coverImage: entry.coverImage,
    seasonLabel: entry.season && entry.seasonYear ? seasonLabel({ season: entry.season as SeasonName, year: entry.seasonYear }) : null,
    episodes: entry.episodes,
    candidate,
  };
}

export async function listAnidbOnly(tab: "suggested" | "none", pageInput: number): Promise<AnidbOnlyPage> {
  const page = Math.max(0, Math.floor(pageInput) || 0);
  const pending = await prisma.anidbCandidate.findMany({ where: { status: "PENDING" }, select: { anidbId: true } });
  const pendingIds = pending.map((p) => p.anidbId);
  const withEntry = pendingIds.length ? await prisma.catalogEntry.count({ where: { ...ONLY_ANIDB, anidbId: { in: pendingIds } } }) : 0;
  const none = await prisma.catalogEntry.count({ where: { ...ONLY_ANIDB, ...(pendingIds.length ? { NOT: { anidbId: { in: pendingIds } } } : {}) } });
  const counts = { suggested: withEntry, none };

  if (tab === "suggested") {
    const candidates = await prisma.anidbCandidate.findMany({ where: { status: "PENDING" }, orderBy: [{ score: "desc" }, { anidbId: "asc" }] });
    const entries = await prisma.catalogEntry.findMany({ where: { ...ONLY_ANIDB, anidbId: { in: candidates.map((c) => c.anidbId) } } });
    const byAnidb = new Map(entries.map((e) => [e.anidbId as number, e]));
    const live = candidates.filter((c) => byAnidb.has(c.anidbId));
    const rows = live.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c) => toRow(byAnidb.get(c.anidbId)!, { anilistId: c.anilistId, title: c.candidateTitle, score: c.score, reason: c.reason }));
    return { tab, page, total: live.length, pages: Math.max(1, Math.ceil(live.length / PAGE_SIZE)), rows, counts };
  }

  const entries = await prisma.catalogEntry.findMany({
    where: { ...ONLY_ANIDB, ...(pendingIds.length ? { NOT: { anidbId: { in: pendingIds } } } : {}) },
    orderBy: { titleRomaji: "asc" },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { tab, page, total: none, pages: Math.max(1, Math.ceil(none / PAGE_SIZE)), rows: entries.map((e) => toRow(e, null)), counts };
}

export type SearchHit = { anilistId: number; title: string; titleEnglish: string | null; seasonLabel: string | null; coverImage: string | null };

/** Busca na AniList para o admin escolher a obra certa (sem conteúdo adulto). */
export async function searchForLink(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const media = await searchAnime(q);
  return media
    .filter((m) => !hasBlockedGenre(m.genres))
    .slice(0, 10)
    .map((m) => ({
      anilistId: m.id,
      title: m.title.romaji,
      titleEnglish: m.title.english,
      seasonLabel: m.season && m.seasonYear ? seasonLabel({ season: m.season as SeasonName, year: m.seasonYear }) : m.startDate?.year ? String(m.startDate.year) : null,
      coverImage: m.coverImage.extraLarge,
    }));
}

export type DecisionResult = { ok: true } | { ok: false; status: number; error: string };

/** "É a mesma obra": liga a obra do AniDB à da AniList (a sugerida, ou a que o admin escolheu pela busca). */
export async function confirmCandidate(anidbId: number, anilistIdInput: number | null, actor: AdminActor): Promise<DecisionResult> {
  const stored = await prisma.anidbCandidate.findUnique({ where: { anidbId } });
  const anilistId = anilistIdInput ?? stored?.anilistId ?? null;
  if (anilistId === null) return { ok: false, status: 422, error: "Escolha a obra da AniList." };
  const result: ManualLinkResult = await linkAnidbEntryManually(anidbId, anilistId);
  if (!result.ok) return result;
  await logEvent({ source: "AniDB", event: "Manual link", message: `Obra do AniDB #${anidbId} ligada à AniList #${anilistId} pelo admin.`, context: "Match name · obras sem página", actor });
  return { ok: true };
}

/** "Não é": a sugestão não volta (a obra passa para "sem sugestão", onde ainda dá para escolher outra pela busca). */
export async function rejectCandidate(anidbId: number, actor: AdminActor): Promise<DecisionResult> {
  const stored = await prisma.anidbCandidate.findUnique({ where: { anidbId } });
  if (!stored) return { ok: false, status: 404, error: "Não há sugestão para esta obra." };
  await prisma.anidbCandidate.update({ where: { anidbId }, data: { status: "REJECTED", decidedByName: actor.name } });
  await logEvent({ source: "AniDB", event: "Candidate rejected", message: `Sugestão da AniList #${stored.anilistId} recusada para a obra do AniDB #${anidbId}.`, context: "Match name · obras sem página", actor });
  return { ok: true };
}
