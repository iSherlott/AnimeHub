import { timed, withAnilist } from "@/lib/episodeState";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { getQuizState } from "@/lib/quiz";
import { parseRelations } from "@/lib/production";
import { platformAnilistIds } from "@/lib/platform";
import { AppLink } from "@/components/AppLink";
import { RelatedWorkCard } from "@/components/RelatedWorkCard";
import { VersionsCallout } from "@/components/StoryMarkers";
import { WorkCard } from "@/components/WorkInfoCard";
import type { StoryRelation } from "@/lib/story/context";
import { anilistRef, type WorkRef } from "@/lib/workRef";
import { communitySummary } from "@/lib/community";
import { LinkButton } from "@/components/LinkButton";

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

/** Quiz da obra: `work` é a obra da AniList ou, sem AniList ID, a do catálogo (`workKey` = `anidb-<id>`). */
export async function WorkQuizEntry({ anilistId, work, workKey, userId }: { anilistId?: number; work?: WorkRef; workKey?: string; userId: string | null }) {
  const ref = work ?? anilistRef(anilistId as number);
  const key = workKey ?? String(anilistId);
  const quizState = await getQuizState(ref, userId);
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
          href={`/obra/${key}/quiz`}
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

/** Cartão da comunidade do anime (o fórum da franquia): números, os tópicos mais ativos e o caminho até ela. */
export async function WorkCommunityCard({ workKey }: { workKey: string }) {
  const summary = await communitySummary(workKey);
  if (!summary) return null;
  return (
    <WorkCard title="Comunidade do anime" testId="work-community">
      <Typography sx={{ fontSize: 14, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
        {summary.topics === 0 ? "O fórum da franquia ainda não tem tópicos." : `${summary.members} ${summary.members === 1 ? "membro" : "membros"} · ${summary.topics} ${summary.topics === 1 ? "tópico" : "tópicos"}`}
      </Typography>
      {summary.latest.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
          {summary.latest.map((t) => (
            <li key={t.id}>
              <AppLink href={`/comunidades/${summary.key}/topicos/${t.id}`} underline="hover" sx={{ fontSize: 14, overflowWrap: "anywhere" }}>
                {t.title}
              </AppLink>{" "}
              <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                ({t.replyCount})
              </Typography>
            </li>
          ))}
        </Box>
      )}
      <Box>
        <LinkButton href={`/comunidades/${summary.key}`} variant="outlined" size="small" data-testid="work-community-link">
          Abrir a comunidade
        </LinkButton>
      </Box>
    </WorkCard>
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
