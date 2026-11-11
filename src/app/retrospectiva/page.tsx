import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { SeasonTabs } from "@/components/SectionTabs";
import { SeasonRecapView } from "@/components/SeasonRecapView";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { currentSeasonRef, parseSeasonSlug, recentSeasons, seasonDisplayName, seasonSlug } from "@/lib/exploreGroups";
import { loadSeasonRecap } from "@/lib/seasonRecap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Retrospectiva da temporada · Anime Hub" };

/**
 * Retrospectiva da temporada (10/11/2026): as obras da temporada na lista da pessoa, em que pé está cada uma, os
 * gêneros que mais apareceram, as notas mais altas e o que os amigos mais viram. Sem horas assistidas (o site não
 * guarda progresso por episódio desde 26/10).
 */
type Props = { searchParams: Promise<{ temporada?: string }> };

export default async function SeasonRecapPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/retrospectiva"));
  const { temporada: slug = "" } = await searchParams;
  const season = parseSeasonSlug(slug) ?? currentSeasonRef();
  const recap = await loadSeasonRecap(user.id, season);
  const options = recentSeasons(new Date(), 4).map((s) => ({ slug: seasonSlug(s), label: seasonDisplayName(s) }));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="振り返り / RETROSPECTIVA" title={`Sua ${seasonDisplayName(season)}`} subtitle="As obras da temporada na sua lista, os gêneros que mais apareceram e o que os seus amigos viram." />
        <SeasonTabs active="retrospectiva" />
        <SeasonRecapView recap={recap} seasons={options} currentSlug={seasonSlug(season)} />
      </PageContainer>
    </Box>
  );
}
