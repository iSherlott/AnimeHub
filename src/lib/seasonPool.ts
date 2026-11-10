import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { seasonDisplayName, type SeasonName } from "@/lib/exploreGroups";

/**
 * Bolão da temporada (10/11/2026): o admin abre (disparo no painel); até `closesAt`, cada pessoa escolhe até
 * `picksPerUser` obras da temporada. Pontos de cada obra escolhida, explicados na página:
 *  - a nota do site (média de quem terminou, de 0 a 10) × 10, quando já há votos;
 *  - + 2 por pessoa da rede que acompanha a obra.
 * O placar é calculado na hora; ao encerrar, os pontos ficam gravados.
 */
import { POINTS_PER_FOLLOWER, rankStandings, workPoints, type PoolStanding, type PoolView, type PoolWork } from "@/lib/seasonPoolTypes";
export { POINTS_PER_FOLLOWER, rankStandings, workPoints, type PoolStanding, type PoolView, type PoolWork };

async function seasonWorks(season: string, seasonYear: number): Promise<PoolWork[]> {
  const rows = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, season, seasonYear, anilistId: { not: null }, ...NOT_BLOCKED_GENRE },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, siteScore: true, siteScoreVotes: true, popularityRank: true },
    orderBy: [{ popularityRank: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }],
  });
  const ids = rows.map((r) => r.anilistId as number);
  const followers = ids.length ? await prisma.anime.groupBy({ by: ["anilistId"], where: { anilistId: { in: ids }, userId: { not: null } }, _count: { _all: true } }) : [];
  const followersById = new Map(followers.map((f) => [f.anilistId as number, f._count._all]));
  return rows.map((r) => {
    const count = followersById.get(r.anilistId as number) ?? 0;
    return { workKey: String(r.anilistId), anilistId: r.anilistId as number, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, siteScore: r.siteScore, siteScoreVotes: r.siteScoreVotes, followers: count, points: workPoints(r.siteScore, r.siteScoreVotes, count) };
  });
}

export async function openPool(admin: { id: string }, input: { season?: unknown; seasonYear?: unknown; closesAt?: unknown; picksPerUser?: unknown }): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 409; error: string }> {
  const season = typeof input.season === "string" && ["WINTER", "SPRING", "SUMMER", "FALL"].includes(input.season) ? (input.season as SeasonName) : null;
  const seasonYear = Number(input.seasonYear);
  if (!season || !Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) return { ok: false, status: 400, error: "Escolha a temporada." };
  const closesAt = typeof input.closesAt === "string" ? new Date(input.closesAt) : null;
  if (!closesAt || Number.isNaN(closesAt.getTime())) return { ok: false, status: 400, error: "Informe até quando dá para escolher." };
  const picksPerUser = Number(input.picksPerUser ?? 5);
  if (!Number.isInteger(picksPerUser) || picksPerUser < 1 || picksPerUser > 10) return { ok: false, status: 400, error: "De 1 a 10 obras por pessoa." };
  if ((await seasonWorks(season, seasonYear)).length < picksPerUser) return { ok: false, status: 400, error: "A temporada não tem obras suficientes na plataforma." };
  if (await prisma.seasonPool.findUnique({ where: { season_seasonYear: { season, seasonYear } }, select: { id: true } })) return { ok: false, status: 409, error: "Já existe bolão desta temporada." };
  const pool = await prisma.seasonPool.create({ data: { season, seasonYear, title: `Bolão ${seasonDisplayName({ season, year: seasonYear })}`, picksPerUser, closesAt, createdById: admin.id } });
  return { ok: true, id: pool.id };
}

export async function togglePick(userId: string, poolId: string, workKey: string, picked: boolean, now = new Date()): Promise<{ ok: true; picks: string[] } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const pool = await prisma.seasonPool.findUnique({ where: { id: poolId } });
  if (!pool) return { ok: false, status: 404, error: "Bolão não encontrado." };
  if (pool.status !== "OPEN" || pool.closesAt <= now) return { ok: false, status: 409, error: "As escolhas deste bolão já foram encerradas." };
  if (picked) {
    const work = (await seasonWorks(pool.season, pool.seasonYear)).find((w) => w.workKey === workKey);
    if (!work) return { ok: false, status: 400, error: "Essa obra não é desta temporada." };
    const count = await prisma.seasonPoolPick.count({ where: { poolId, userId } });
    const already = await prisma.seasonPoolPick.findUnique({ where: { poolId_userId_workKey: { poolId, userId, workKey } }, select: { id: true } });
    if (!already && count >= pool.picksPerUser) return { ok: false, status: 409, error: `Você já escolheu ${pool.picksPerUser} obras. Tire uma para trocar.` };
    if (!already) await prisma.seasonPoolPick.create({ data: { poolId, userId, workKey, titleRomaji: work.titleRomaji, coverImage: work.coverImage } });
  } else {
    await prisma.seasonPoolPick.deleteMany({ where: { poolId, userId, workKey } });
  }
  return { ok: true, picks: (await prisma.seasonPoolPick.findMany({ where: { poolId, userId }, select: { workKey: true } })).map((p) => p.workKey) };
}

/** Encerra: grava os pontos de cada escolha (o placar fica congelado). */
export async function finishPool(poolId: string, now = new Date()): Promise<{ ok: true } | { ok: false; status: 404 | 409; error: string }> {
  const pool = await prisma.seasonPool.findUnique({ where: { id: poolId } });
  if (!pool) return { ok: false, status: 404, error: "Bolão não encontrado." };
  if (pool.status === "FINISHED") return { ok: false, status: 409, error: "O bolão já foi encerrado." };
  const points = new Map((await seasonWorks(pool.season, pool.seasonYear)).map((w) => [w.workKey, w.points]));
  const picks = await prisma.seasonPoolPick.findMany({ where: { poolId }, select: { id: true, workKey: true } });
  await prisma.$transaction([
    ...picks.map((p) => prisma.seasonPoolPick.update({ where: { id: p.id }, data: { points: points.get(p.workKey) ?? 0 } })),
    prisma.seasonPool.update({ where: { id: poolId }, data: { status: "FINISHED", finishedAt: now } }),
  ]);
  return { ok: true };
}

/** O bolão mais recente (aberto ou encerrado), com as obras, as minhas escolhas e o placar. */
export async function currentPool(viewerId: string | null, now = new Date()): Promise<PoolView | null> {
  const pool = await prisma.seasonPool.findFirst({ orderBy: { createdAt: "desc" } });
  if (!pool) return null;
  const finished = pool.status === "FINISHED";
  const works = await seasonWorks(pool.season, pool.seasonYear);
  const picks = await prisma.seasonPoolPick.findMany({ where: { poolId: pool.id }, include: { user: { select: { displayName: true } } } });
  const pointsByWork = finished ? new Map(picks.map((p) => [p.workKey, p.points ?? 0])) : new Map(works.map((w) => [w.workKey, w.points]));
  return {
    id: pool.id,
    title: pool.title,
    seasonLabel: seasonDisplayName({ season: pool.season as SeasonName, year: pool.seasonYear }),
    status: pool.status,
    closesAt: pool.closesAt.toISOString(),
    picksPerUser: pool.picksPerUser,
    open: pool.status === "OPEN" && pool.closesAt > now,
    works,
    myPicks: viewerId ? picks.filter((p) => p.userId === viewerId).map((p) => p.workKey) : [],
    standings: rankStandings(picks.map((p) => ({ userId: p.userId, displayName: p.user.displayName, workKey: p.workKey })), pointsByWork),
  };
}
