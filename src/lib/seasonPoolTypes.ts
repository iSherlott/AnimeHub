/** Regras e tipos do bolão que o navegador também usa (sem nada do servidor). Ver seasonPool.ts. */
export const POINTS_PER_FOLLOWER = 2;

export type PoolWork = { workKey: string; anilistId: number; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; siteScore: number; siteScoreVotes: number; followers: number; points: number };
export type PoolStanding = { userId: string; displayName: string; points: number; picks: string[] };
export type PoolView = {
  id: string;
  title: string;
  seasonLabel: string;
  status: string;
  closesAt: string;
  picksPerUser: number;
  open: boolean;
  works: PoolWork[];
  myPicks: string[];
  standings: PoolStanding[];
};

/** Pontos de uma obra (regra pura, explicada na página). */
export function workPoints(siteScore: number, siteScoreVotes: number, followers: number): number {
  return (siteScoreVotes > 0 ? Math.round(siteScore * 10) : 0) + POINTS_PER_FOLLOWER * followers;
}

/** Placar: soma dos pontos das obras escolhidas; empate em ordem de nome. */
export function rankStandings(picks: { userId: string; displayName: string; workKey: string }[], pointsByWork: Map<string, number>): PoolStanding[] {
  const byUser = new Map<string, PoolStanding>();
  for (const p of picks) {
    const row = byUser.get(p.userId) ?? { userId: p.userId, displayName: p.displayName, points: 0, picks: [] };
    row.points += pointsByWork.get(p.workKey) ?? 0;
    row.picks.push(p.workKey);
    byUser.set(p.userId, row);
  }
  return [...byUser.values()].sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName, "pt-BR"));
}
