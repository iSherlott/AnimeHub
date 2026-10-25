import { timed, withAnilist } from "@/lib/episodeState";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { getQuizState } from "@/lib/quiz";
import { parseRelations } from "@/lib/production";
import { platformAnilistIds } from "@/lib/platform";
import { AppLink } from "@/components/AppLink";
import { HashtagRow } from "@/components/HashtagRow";
import { PublishAboutButton } from "@/components/PublishAboutButton";
import { RelatedWorkCard } from "@/components/RelatedWorkCard";
import { VersionsCallout } from "@/components/StoryMarkers";
import { WorkCard } from "@/components/WorkInfoCard";
import type { StoryRelation } from "@/lib/story/context";
import { UserPostList } from "@/components/UserPostList";

/** Seções que toda obra tem, esteja ou não na lista de quem olha: quiz, discussões e histórias relacionadas. */

const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial", MUSIC: "Música" };
const RELATION_LABEL: Record<string, string> = {
  PREQUEL: "Anterior",
  SEQUEL: "Continuação",
  PARENT: "Obra principal",
  SIDE_STORY: "História paralela",
  SPIN_OFF: "Derivado",
  ALTERNATIVE: "Versão alternativa",
  SUMMARY: "Resumo",
};

export async function WorkQuizEntry({ anilistId, userId }: { anilistId: number; userId: string | null }) {
  const quizState = await getQuizState(anilistId, userId);
  if (!quizState.quiz) return null;
  return (
    <WorkCard title="Quiz do anime" testId="quiz-entry">
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        {quizState.quiz.available
          ? `10 perguntas · ${quizState.quiz.scope}. Acerte todas para desbloquear o título "${quizState.quiz.titleReward}".`
          : "Em preparação: ainda faltam perguntas aprovadas."}
      </Typography>
      <Box>
        <AppLink
          href={`/obra/${anilistId}/quiz`}
          underline="none"
          data-testid="quiz-link"
          sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 2, py: 1.5, borderRadius: "10px", bgcolor: "#171820", color: "text.primary", fontSize: 14, fontWeight: 700, "&:hover": { bgcolor: "#1d1e28" } }}
        >
          {quizState.attempt.status === "COMPLETED" ? "Ver resultado do quiz" : "Ver o quiz"}
        </AppLink>
      </Box>
    </WorkCard>
  );
}

export async function WorkDiscussions({
  anilistId,
  titleNative,
  titleRomaji,
  titleEnglish,
  seasonNumber,
  loggedIn,
}: {
  anilistId: number;
  titleNative: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  seasonNumber: number;
  loggedIn: boolean;
}) {
  // Hashtags mais usadas nas discussões desta obra (Figma 13:42469).
  const topTags = await prisma.postHashtag.groupBy({
    by: ["hashtagId"],
    where: { post: { anilistId, deletedAt: null } },
    _count: { _all: true },
    orderBy: { _count: { hashtagId: "desc" } },
    take: 3,
  });
  const tagRows = topTags.length ? await prisma.hashtag.findMany({ where: { id: { in: topTags.map((t) => t.hashtagId) } }, select: { id: true, key: true, display: true } }) : [];
  const orderedTags = topTags.map((t) => tagRows.find((r) => r.id === t.hashtagId)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const titlePrimary = titleNative ?? titleRomaji;

  return (
    <Box component="section" aria-labelledby="discussoes-heading" id="discussoes" data-testid="discussions" sx={{ borderTop: 1, borderColor: "divider", pt: 4, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography id="discussoes-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
          Discussões sobre esta obra
        </Typography>
        <PublishAboutButton anilistId={anilistId} loggedIn={loggedIn} />
      </Box>
      <Typography sx={{ fontSize: 16, color: "text.secondary" }}>Impressões da comunidade · Temporada {seasonNumber}. Contexto explícito, spoilers protegidos.</Typography>
      <HashtagRow tags={orderedTags.map((t) => ({ key: t.key, display: t.display }))} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 320px" }, columnGap: 5, rowGap: 3, alignItems: "start" }}>
        <UserPostList endpoint="/api/posts" params={{ tab: "recent", anilistId: String(anilistId) }} timeStyle="relative" emptyText="Esta obra ainda não tem discussões. Seja a primeira pessoa a compartilhar uma impressão." />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography lang={titleNative ? "ja" : undefined} sx={{ fontSize: 20, fontWeight: 700 }}>
              {titlePrimary}
            </Typography>
            {titleEnglish && titleEnglish !== titlePrimary && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{titleEnglish}</Typography>}
          </Box>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Selecionar “Publicar” abre o editor com esta produção pré-selecionada, removível. Não cria um post de acompanhamento.</Typography>
        </Box>
      </Box>
    </Box>
  );
}

/** Histórias ligadas à obra que NÃO são outra temporada dela (derivados, filmes, versões alternativas…), só as que estão na plataforma. */
export async function WorkRelated({ anilistId, franchiseId, relationsJson, seasonIds, story = [] }: { anilistId: number; franchiseId: string | null; relationsJson: string | null; seasonIds: number[]; story?: StoryRelation[] }) {
  const platformIds = await platformAnilistIds();
  const known = new Set<number>([anilistId, ...seasonIds]);
  const siblings = franchiseId
    ? await prisma.production.findMany({
        where: { franchiseId, NOT: { anilistId: { in: [...known] } } },
        select: { anilistId: true, titleRomaji: true, titleNative: true, titleEnglish: true, coverImage: true, seasonNumber: true, format: true },
      })
    : [];
  for (const s of siblings) known.add(s.anilistId);
  const related = parseRelations(relationsJson).filter((r) => !known.has(r.id) && platformIds.has(r.id));
  if (siblings.length === 0 && related.length === 0 && story.length === 0) return null;
  const versionNote = new Map(story.map((s) => [s.other.anilistId, s.role === "REBOOT" ? "Versão antiga (refeita nesta)" : "Reboot (refaz esta história)"]));

  const ids = siblings.map((s) => s.anilistId);
  const airings = ids.length
    ? withAnilist(timed(await prisma.airingScheduleEntry.findMany({ where: { anilistId: { in: ids }, airingAt: { gte: new Date() }, status: "ACTIVE" }, orderBy: { airingAt: "asc" }, select: { anilistId: true, airingAt: true } })))
    : [];
  const nextBy = new Map<number, Date>();
  for (const a of airings) if (!nextBy.has(a.anilistId)) nextBy.set(a.anilistId, a.airingAt);

  return (
    <Box component="section" id="relacionadas" aria-labelledby="relacionadas-heading" data-testid="related" sx={{ display: "flex", flexDirection: "column", gap: 3, scrollMarginTop: 150 }}>
      <Typography id="relacionadas-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        Histórias relacionadas
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Derivados, filmes e outras versões ligadas a esta obra.</Typography>
      <VersionsCallout relations={story} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 3 }}>
        {siblings.map((s) => (
          <RelatedWorkCard
            key={s.anilistId}
            anilistId={s.anilistId}
            coverImage={s.coverImage}
            titleNative={s.titleNative}
            titleRomaji={s.titleRomaji}
            titleEnglish={s.titleEnglish}
            nextAiringAt={nextBy.get(s.anilistId)?.toISOString() ?? null}
            note={`Temporada ${s.seasonNumber}${s.format ? ` · ${FORMAT_LABEL[s.format] ?? s.format}` : ""}`}
          />
        ))}
        {related.map((r) => (
          <RelatedWorkCard
            key={r.id}
            anilistId={r.id}
            coverImage={null}
            titleNative={null}
            titleRomaji={r.titleRomaji}
            titleEnglish={null}
            nextAiringAt={null}
            note={`${versionNote.get(r.id) ?? RELATION_LABEL[r.relationType] ?? r.relationType}${r.format ? ` · ${FORMAT_LABEL[r.format] ?? r.format}` : ""}`}
          />
        ))}
      </Box>
    </Box>
  );
}
