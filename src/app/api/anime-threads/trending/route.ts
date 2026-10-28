import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

const DAY_SECONDS = 24 * 3600;

/** Fallback só usado quando `todayStart` não vem na query (ex.: chamada
 * direta à API) — nesse caso não há como saber o fuso do cliente, então
 * caímos no relógio do servidor mesmo. */
function serverTodayStart(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor(today.getTime() / 1000);
}

type CommentGroup = {
  anilistId: number;
  _count: { id: number };
  _max?: { createdAt: Date | null };
};

type ThreadSummary = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  commentCount: number;
  lastCommentAt: string | null;
};

const LIMIT = 5;

/**
 * Comment (Epic 15) não guarda título/capa — é chaveado só por anilistId.
 * Qualquer linha de Anime com esse anilistId serve (comentar exige ter o
 * anime na própria lista, então sempre existe pelo menos 1 quando há
 * comentário) — mas se todo mundo que comentou já removeu o anime da
 * própria lista depois, pode não sobrar nenhuma; nesse caso o chamador
 * descarta essa entrada em vez de mostrar um anilistId cru sem nome.
 */
async function resolveAnimeMeta(anilistId: number) {
  return prisma.anime.findFirst({
    where: { anilistId },
    select: { titleRomaji: true, titleEnglish: true, coverImage: true },
    orderBy: { createdAt: "asc" },
  });
}

async function toSummaries(groups: CommentGroup[]): Promise<ThreadSummary[]> {
  const resolved = await Promise.all(
    groups.map(async (g) => {
      const anime = await resolveAnimeMeta(g.anilistId);
      if (!anime) return null;
      const summary: ThreadSummary = {
        anilistId: g.anilistId,
        titleRomaji: anime.titleRomaji,
        titleEnglish: anime.titleEnglish,
        coverImage: anime.coverImage,
        commentCount: g._count.id,
        lastCommentAt: g._max?.createdAt?.toISOString() ?? null,
      };
      return summary;
    })
  );
  return resolved.filter((r): r is ThreadSummary => r !== null);
}

/**
 * Lateral do Feed (Epic 25) — "trending topics" de THREAD DE ANIME (Epic
 * 15), não de post do Feed (Epic 24). Pública, sem login, mesma
 * filosofia do resto do Feed.
 *
 * `todayStart` é o timestamp Unix (segundos) da meia-noite **no fuso do
 * navegador**, calculado pelo front-end (FeedSidebar.tsx) — mesmo
 * padrão já usado por /api/calendar, e pela mesma razão: recalcular "hoje"
 * com o relógio do servidor (que roda em UTC no Docker Compose, sem `TZ`
 * setado em nenhum serviço) discorda do fuso de quem está vendo a página
 * pra qualquer viewer fora de UTC — um comentário postado antes da meia-
 * noite local já cairia no "amanhã" do servidor, e vice-versa (achado real
 * da 22ª rodada de auditoria, Epic 18). Ainda limitado a +-2 dias do
 * relógio do servidor, só como cinto de segurança contra abuso.
 */
export async function GET(request: NextRequest) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const todayStartRaw = request.nextUrl.searchParams.get("todayStart");
  const todayStartParam = todayStartRaw !== null ? Number(todayStartRaw) : NaN;
  const serverNow = Math.floor(Date.now() / 1000);
  const safetyMargin = 2 * DAY_SECONDS;
  const usingClientTodayStart =
    Number.isFinite(todayStartParam) && Math.abs(todayStartParam - serverNow) <= safetyMargin;
  const todayStart = new Date((usingClientTodayStart ? todayStartParam : serverTodayStart()) * 1000);

  const [recentGroups, todayGroups] = await Promise.all([
    prisma.comment.groupBy({
      by: ["anilistId"],
      // Os tópicos em alta são das obras da AniList (o resumo vem dela); obra só do AniDB/Kitsu fica de fora.
      where: { deletedAt: null, anilistId: { not: null } },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: LIMIT,
    }),
    prisma.comment.groupBy({
      by: ["anilistId"],
      where: { deletedAt: null, anilistId: { not: null }, createdAt: { gte: todayStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: LIMIT,
    }),
  ]);

  const withAnilist = <T extends { anilistId: number | null }>(groups: T[]) => groups.filter((g): g is T & { anilistId: number } => g.anilistId !== null);
  const [recent, mostCommentedToday] = await Promise.all([
    toSummaries(withAnilist(recentGroups)),
    toSummaries(withAnilist(todayGroups)),
  ]);

  return NextResponse.json({ recent, mostCommentedToday });
}
