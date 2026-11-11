import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Chip } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { SeasonTabs } from "@/components/SectionTabs";
import { TierListEditor } from "@/components/TierListEditor";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { currentSeasonRef, parseSeasonSlug, recentSeasons, seasonDisplayName, seasonSlug } from "@/lib/exploreGroups";
import { loadTierList } from "@/lib/tierList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tier list da temporada · Anime Hub" };

type Props = { searchParams: Promise<{ temporada?: string }> };

/** Tier list da temporada (10/11/2026): S/A/B/C/D com as obras que a pessoa acompanha, e publicar no Feed. */
export default async function TierListPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/tier-list"));
  const { temporada = "" } = await searchParams;
  const season = parseSeasonSlug(temporada) ?? currentSeasonRef();
  const data = await loadTierList(user.id, season);
  const slug = seasonSlug(season);
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="ランキング / TIER LIST" title={`Tier list · ${seasonDisplayName(season)}`} subtitle="Distribua as obras que você acompanha nesta temporada e publique no Feed para a rede comentar." />
        <SeasonTabs active="tier-list" />
        <Box component="nav" aria-label="Escolher temporada" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {recentSeasons(new Date(), 4).map((s) => (
            <Chip key={seasonSlug(s)} component="a" href={`/tier-list?temporada=${seasonSlug(s)}`} clickable label={seasonDisplayName(s)} color={seasonSlug(s) === slug ? "primary" : "default"} variant={seasonSlug(s) === slug ? "filled" : "outlined"} />
          ))}
        </Box>
        <TierListEditor key={slug} season={season.season} seasonYear={season.year} works={data.works} initial={data.tiers} initialPostId={data.postId} />
      </PageContainer>
    </Box>
  );
}
