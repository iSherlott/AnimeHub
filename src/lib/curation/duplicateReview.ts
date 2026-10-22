import { prisma } from "@/lib/prisma";
import { logEvent, type AdminActor } from "@/lib/adminImport/pipeline";
import { confirmCandidate } from "@/lib/anidbCandidates";
import { seasonLabel, type SeasonName } from "@/lib/exploreGroups";

/**
 * Revisão das obras repetidas apontadas pela auditoria (Epic 45). Cada par vem das pendências DUPLICATE_SUSPECT abertas; quem
 * decide é o admin: "é a mesma obra" junta as duas (só quando uma é a cópia do AniDB sem página, pelo mesmo caminho do
 * Match name) e "não é a mesma" tira o par da lista para sempre (as pendências ficam DISMISSED e a auditoria não as reabre).
 */
export type ReviewSide = {
  entryId: string;
  title: string;
  titleEnglish: string | null;
  coverImage: string | null;
  seasonLabel: string | null;
  episodes: number | null;
  kind: string | null;
  anilistId: number | null;
  anidbId: number | null;
};

export type ReviewPair = {
  key: string;
  left: ReviewSide;
  right: ReviewSide;
  reason: string;
  /** Só existe quando uma das duas é a cópia do AniDB sem página: é ela que passa a ser a obra da AniList. */
  merge: { anidbId: number; anilistId: number } | null;
};

/** Quem a pendência cita como parecida: «Título» (AniList 123) ou «Título» (AniDB 456). */
export function parsePartners(detail: string | null): Array<{ title: string; source: "AniList" | "AniDB"; id: number; reason: string }> {
  if (!detail) return [];
  const out: Array<{ title: string; source: "AniList" | "AniDB"; id: number; reason: string }> = [];
  for (const part of detail.split("; ")) {
    const match = /^(.*?) — «(.+)» \((AniList|AniDB) (\d+)\)$/.exec(part);
    if (match) out.push({ reason: match[1], title: match[2], source: match[3] as "AniList" | "AniDB", id: Number(match[4]) });
  }
  return out;
}

const SELECT = { id: true, titleRomaji: true, titleEnglish: true, coverImage: true, season: true, seasonYear: true, episodes: true, kind: true, anilistId: true, anidbId: true } as const;
type Row = { id: string; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; season: string | null; seasonYear: number | null; episodes: number | null; kind: string | null; anilistId: number | null; anidbId: number | null };

const side = (e: Row): ReviewSide => ({
  entryId: e.id,
  title: e.titleRomaji,
  titleEnglish: e.titleEnglish,
  coverImage: e.coverImage,
  seasonLabel: e.season && e.seasonYear ? seasonLabel({ season: e.season as SeasonName, year: e.seasonYear }) : e.seasonYear ? String(e.seasonYear) : null,
  episodes: e.episodes,
  kind: e.kind,
  anilistId: e.anilistId,
  anidbId: e.anidbId,
});

export async function listDuplicateReview(): Promise<ReviewPair[]> {
  const issues = await prisma.curationIssue.findMany({ where: { code: "DUPLICATE_SUSPECT", status: "OPEN" }, orderBy: { title: "asc" } });
  const entries = await prisma.catalogEntry.findMany({ where: { id: { in: issues.map((i) => i.entryId) }, onPlatform: true }, select: SELECT });
  const byId = new Map(entries.map((e) => [e.id, e]));
  const pairs = new Map<string, ReviewPair>();
  for (const issue of issues) {
    const me = byId.get(issue.entryId);
    if (!me) continue;
    for (const partner of parsePartners(issue.detail)) {
      const other = await prisma.catalogEntry.findFirst({ where: { onPlatform: true, ...(partner.source === "AniList" ? { anilistId: partner.id } : { anidbId: partner.id }) }, select: SELECT });
      if (!other || other.id === me.id) continue;
      const key = [me.id, other.id].sort().join(":");
      if (pairs.has(key)) continue;
      const [orphan, target] = me.anilistId === null && other.anilistId !== null ? [me, other] : other.anilistId === null && me.anilistId !== null ? [other, me] : [null, null];
      pairs.set(key, {
        key,
        left: side(me),
        right: side(other),
        reason: partner.reason,
        merge: orphan && target && orphan.anidbId !== null && target.anilistId !== null ? { anidbId: orphan.anidbId, anilistId: target.anilistId } : null,
      });
    }
  }
  return [...pairs.values()];
}

const OPEN = { code: "DUPLICATE_SUSPECT", status: "OPEN" } as const;

/** "Não é a mesma obra": o par sai da lista e a auditoria não o reabre. */
export async function dismissDuplicate(entryIds: string[], actor: AdminActor): Promise<number> {
  const result = await prisma.curationIssue.updateMany({ where: { ...OPEN, entryId: { in: entryIds } }, data: { status: "DISMISSED" } });
  await logEvent({ source: "Catálogo", event: "Duplicate dismissed", message: `Par de obras marcado como diferente (${entryIds.length} obras).`, context: "Curadoria · obras repetidas", actor });
  return result.count;
}

export type MergeResult = { ok: true } | { ok: false; status: number; error: string };

/** "É a mesma obra": a cópia do AniDB passa a ser a obra da AniList (a cópia some) e as duas pendências se fecham. */
export async function mergeDuplicate(anidbId: number, anilistId: number, actor: AdminActor): Promise<MergeResult> {
  const orphan = await prisma.catalogEntry.findFirst({ where: { anidbId, anilistId: null }, select: { id: true } });
  const result = await confirmCandidate(anidbId, anilistId, actor);
  if (!result.ok) return result;
  const target = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { id: true } });
  const ids = [orphan?.id, target?.id].filter((id): id is string => Boolean(id));
  await prisma.curationIssue.updateMany({ where: { ...OPEN, entryId: { in: ids } }, data: { status: "RESOLVED" } });
  return { ok: true };
}
