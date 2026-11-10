import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer } from "@/components/PageShell";
import { CoverImage } from "@/components/CoverImage";
import { FavoriteCharacterButton } from "@/components/FavoriteCharacterButton";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Personagem · Anime Hub" };

type Props = { params: Promise<{ id: string }> };

/** Página do personagem (10/11/2026): as obras em que aparece, com o dublador japonês, e quantos o têm como favorito. */
export default async function CharacterPage({ params }: Props) {
  const id = Number((await params).id);
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/personagem/${(await params).id}`));
  if (!Number.isInteger(id) || id <= 0) notFound();
  const character = await prisma.character.findUnique({ where: { id }, include: { works: { include: { voiceActor: true } }, _count: { select: { favoritedBy: true } } } });
  if (!character) notFound();
  const workIds = character.works.map((w) => w.anilistId);
  const [works, mine] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { anilistId: { in: workIds } }, select: { anilistId: true, titleRomaji: true, seasonYear: true } }),
    prisma.favoriteCharacter.findUnique({ where: { userId_characterId: { userId: user.id, characterId: id } }, select: { characterId: true } }),
  ]);
  const workById = new Map(works.map((w) => [w.anilistId as number, w]));
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Box sx={{ position: "relative", width: 180, aspectRatio: "3 / 4", borderRadius: "16px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>{character.image && <CoverImage src={character.image} sizes="180px" />}</Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0, flex: "1 1 280px" }}>
            <Typography component="h1" sx={{ fontSize: { xs: 32, md: 40 }, lineHeight: 1.2 }}>
              {character.name}
            </Typography>
            {character.nativeName && (
              <Typography lang="ja" sx={{ fontSize: 18, color: "text.secondary" }}>
                {character.nativeName}
              </Typography>
            )}
            <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="character-favorites">
              {character._count.favoritedBy} {character._count.favoritedBy === 1 ? "pessoa tem" : "pessoas têm"} como favorito
            </Typography>
            <FavoriteCharacterButton characterId={id} initial={Boolean(mine)} />
          </Box>
        </Box>
        <Box component="section" aria-labelledby="character-works" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography id="character-works" component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>
            Aparece em
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, display: "flex", flexDirection: "column", gap: 0.75 }}>
            {character.works.map((w) => {
              const work = workById.get(w.anilistId);
              return (
                <Box component="li" key={w.id} data-testid="character-work" sx={{ fontSize: 15 }}>
                  <AppLink href={`/anime/${w.anilistId}`} underline="hover">
                    {work?.titleRomaji ?? `Obra #${w.anilistId}`}
                  </AppLink>
                  {work?.seasonYear ? ` (${work.seasonYear})` : ""} · {w.role === "MAIN" ? "principal" : "apoio"}
                  {w.voiceActor && (
                    <>
                      {" · voz de "}
                      <AppLink href={`/dublador/${w.voiceActor.id}`} underline="hover">
                        {w.voiceActor.name}
                      </AppLink>
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
