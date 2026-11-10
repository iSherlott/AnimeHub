/** Tipos do anime da semana que o navegador também usa. Ver weeklyVote.ts. */
export type WeeklyOption = { id: string; workKey: string; titleRomaji: string; coverImage: string | null; episode: number | null; votes: number };
export type WeeklyVoteView = { id: string; title: string; status: string; closesAt: string; options: WeeklyOption[]; myOptionId: string | null; totalVotes: number; winnerKey: string | null; postId: string | null };
