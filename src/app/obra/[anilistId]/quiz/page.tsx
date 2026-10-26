import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { QuizExperience } from "@/components/QuizExperience";
import { getCurrentUser } from "@/lib/auth/session";
import { getQuizState } from "@/lib/quiz";
import { resolveWorkKey } from "@/lib/workRef";

type Params = { params: Promise<{ anilistId: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quiz · Anime Hub" };

/**
 * Quiz da obra (Figma "20 — Quiz"): introdução com aviso de spoiler, uma pergunta por vez e resultado.
 * Pública para ver o estado; fazer o quiz exige conta e a obra em Acompanhando.
 */
export default async function QuizPage({ params }: Params) {
  // A chave é o AniList ID ou, para obra sem ele (só do AniDB/Kitsu), `anidb-<id>`/`kitsu-<id>`.
  const work = await resolveWorkKey((await params).anilistId);
  if (!work) notFound();

  const user = await getCurrentUser();
  const state = await getQuizState(work, user?.id ?? null);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="知識 / QUIZ DO ANIME"
          title={state.quiz?.titleReward ? `Quiz: ${state.quiz.titleReward}` : "Quiz do anime"}
          subtitle={`${work.titleNative ?? work.titleRomaji} · 10 perguntas · recompensa apenas com 10/10.`}
        />
        <AppLink href={`/anime/${work.key}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Voltar ao anime / {work.titleNative ?? work.titleRomaji}
        </AppLink>
        <QuizExperience workKey={work.key} work={work} state={state} loggedIn={Boolean(user)} />
      </PageContainer>
    </Box>
  );
}
