/** A atividade de um amigo, agrupada por obra (sem nada do servidor: o Feed usa no navegador). */
export type ActivityItem = {
  key: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
  workKey: string;
  href: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  finished: boolean;
  score: number | null;
  at: string;
};

/** "terminou X e deu 9" / "terminou X" / "deu 9 para X". */
export function activityText(item: Pick<ActivityItem, "finished" | "score">, title: string): string {
  if (item.finished && item.score !== null) return `terminou ${title} e deu ${item.score}`;
  if (item.finished) return `terminou ${title}`;
  return `deu ${item.score} para ${title}`;
}
