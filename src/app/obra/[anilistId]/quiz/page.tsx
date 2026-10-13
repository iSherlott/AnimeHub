import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { QuizExperience } from "@/components/QuizExperience";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getQuizState } from "@/lib/quiz";

type Params = { params: Promise<{ anilistId: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quiz · Anime Hub" };

/**
 * Quiz da obra (Figma "20 — Quiz"): introdução com aviso de spoiler, uma pergunta por vez e resultado.
 * Pública para ver o estado; fazer o quiz exige conta e a obra em Acompanhando.
 */
export default async function QuizPage({ params }: Params) {
  const raw = (await params).anilistId;
  if (!/^\d{1,9}$/.test(raw) || Number(raw) <= 0) notFound();
  const anilistId = Number(raw);

  const [production, catalog] = await Promise.all([
    prisma.production.findUnique({ where: { anilistId }, select: { titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
    prisma.catalogEntry.findUnique({ where: { anilistId }, select: { titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
  ]);
  const work = production ?? catalog;
  if (!work) notFound();

  const user = await getCurrentUser();
  const state = await getQuizState(anilistId, user?.id ?? null);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="知識 / QUIZ DO ANIME"
          title={state.quiz?.titleReward ? `Quiz: ${state.quiz.titleReward}` : "Quiz do anime"}
          subtitle={`${work.titleNative ?? work.titleRomaji} · 10 perguntas · recompensa apenas com 10/10.`}
        />
        <AppLink href={`/anime/${anilistId}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Voltar ao anime / {work.titleNative ?? work.titleRomaji}
        </AppLink>
        <QuizExperience anilistId={anilistId} work={work} state={state} loggedIn={Boolean(user)} />
      </PageContainer>
    </Box>
  );
}
