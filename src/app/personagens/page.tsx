import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { SeasonTabs } from "@/components/SectionTabs";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { currentSeasonRef, parseSeasonSlug, recentSeasons, seasonDisplayName, seasonSlug } from "@/lib/exploreGroups";
import { seasonCharacterRanking } from "@/lib/seasonCharacters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Personagens da temporada · Anime Hub" };

type Props = { searchParams: Promise<{ temporada?: string }> };

/** Personagens da temporada (12/11/2026): o ranking pelos favoritos e o escolhido pela administração, se já saiu. */
export default async function SeasonCharactersPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/personagens"));
  const { temporada = "" } = await searchParams;
  const season = parseSeasonSlug(temporada) ?? currentSeasonRef();
  const slug = seasonSlug(season);
  const [ranking, award] = await Promise.all([
    seasonCharacterRanking(season, 20),
    prisma.seasonCharacterAward.findUnique({ where: { season_seasonYear: { season: season.season, seasonYear: season.year } }, select: { characterId: true, postId: true } }),
  ]);
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="キャラ / PERSONAGENS" title={`Personagens · ${seasonDisplayName(season)}`} subtitle="Os mais favoritados entre os personagens das obras da temporada. Favorite até 5 na página de cada personagem." />
        <SeasonTabs active="personagens" />
        <Box component="nav" aria-label="Escolher temporada" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {recentSeasons(new Date(), 4).map((s) => (
            <Chip key={seasonSlug(s)} component="a" href={`/personagens?temporada=${seasonSlug(s)}`} clickable label={seasonDisplayName(s)} color={seasonSlug(s) === slug ? "primary" : "default"} variant={seasonSlug(s) === slug ? "filled" : "outlined"} />
          ))}
        </Box>
        {ranking.length === 0 ? (
          <Typography sx={{ color: "text.secondary" }}>Nenhum personagem desta temporada foi favoritado ainda.</Typography>
        ) : (
          <Box component="ol" data-testid="characters-ranking" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" }, gap: 1.5 }}>
            {ranking.map((c, i) => {
              const winner = award?.characterId === c.characterId;
              return (
                <Box component="li" key={c.characterId} data-testid="season-character" sx={{ display: "flex", gap: 1.5, alignItems: "center", p: 1, borderRadius: "12px", border: 1, borderColor: winner ? "secondary.main" : "divider" }}>
                  <Typography sx={{ width: 28, textAlign: "center", fontSize: 18, fontWeight: 800, color: i < 3 ? "secondary.main" : "text.secondary", fontVariantNumeric: "tabular-nums" }}>{i + 1}</Typography>
                  <Box sx={{ width: 48, height: 64, flexShrink: 0, borderRadius: "8px", overflow: "hidden", bgcolor: "#171820" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.image && <img src={c.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <AppLink href={`/personagem/${c.characterId}`} underline="hover" sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
                      {c.name}
                    </AppLink>
                    <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>
                      <AppLink href={`/anime/${c.workKey}`} underline="hover" sx={{ color: "inherit" }}>
                        {c.workTitle}
                      </AppLink>
                      {winner ? " · personagem da temporada" : ""}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} data-testid="season-character-favorites">
                    ♥ {c.favorites}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}
