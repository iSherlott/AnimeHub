import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ThemeRow } from "@/components/WorkThemesAndCast";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { currentSeasonRef, parseSeasonSlug, recentSeasons, seasonDisplayName, seasonSlug } from "@/lib/exploreGroups";
import { seasonThemeRanking } from "@/lib/animeThemes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aberturas da temporada · Anime Hub" };

type Props = { searchParams: Promise<{ temporada?: string; tipo?: string }> };

/** Melhores aberturas (e encerramentos) da temporada (10/11/2026), pelas curtidas de quem tem conta. */
export default async function ThemesRankingPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/aberturas"));
  const { temporada = "", tipo = "OP" } = await searchParams;
  const season = parseSeasonSlug(temporada) ?? currentSeasonRef();
  const type = tipo === "ED" ? "ED" : "OP";
  const ranking = await seasonThemeRanking(season.season, season.year, user.id, type);
  const slug = seasonSlug(season);
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="主題歌 / ABERTURAS" title={`${type === "OP" ? "Aberturas" : "Encerramentos"} · ${seasonDisplayName(season)}`} subtitle="Curta as suas preferidas: o ranking é de quem tem conta no AnimeHub. O vídeo abre no AnimeThemes." />
        <Box component="nav" aria-label="Escolher temporada e tipo" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {recentSeasons(new Date(), 4).map((s) => (
            <Chip key={seasonSlug(s)} component="a" href={`/aberturas?temporada=${seasonSlug(s)}&tipo=${type}`} clickable label={seasonDisplayName(s)} color={seasonSlug(s) === slug ? "primary" : "default"} variant={seasonSlug(s) === slug ? "filled" : "outlined"} />
          ))}
          <Chip component="a" href={`/aberturas?temporada=${slug}&tipo=${type === "OP" ? "ED" : "OP"}`} clickable label={type === "OP" ? "Ver encerramentos" : "Ver aberturas"} variant="outlined" />
        </Box>
        {ranking.length === 0 ? (
          <Typography sx={{ color: "text.secondary" }}>As músicas desta temporada ainda não foram carregadas.</Typography>
        ) : (
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }} data-testid="themes-ranking">
            {ranking.map((t, i) => (
              <Box key={t.id} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                <Typography sx={{ width: 32, flexShrink: 0, textAlign: "right", fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{i + 1}º</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {t.work && (
                    <AppLink href={`/anime/${t.work.anilistId}`} underline="hover" sx={{ fontSize: 12, color: "text.secondary" }}>
                      {t.work.titleRomaji}
                    </AppLink>
                  )}
                  <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                    <ThemeRow theme={t} signedIn />
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}
