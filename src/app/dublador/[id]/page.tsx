import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer } from "@/components/PageShell";
import { CoverImage } from "@/components/CoverImage";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dublador · Anime Hub" };

type Props = { params: Promise<{ id: string }> };

/** Página do dublador japonês (seiyuu) (10/11/2026): os personagens que ele dubla nas obras da plataforma. */
export default async function VoiceActorPage({ params }: Props) {
  const raw = (await params).id;
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/dublador/${raw}`));
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const actor = await prisma.voiceActor.findUnique({ where: { id }, include: { roles: { include: { character: true }, orderBy: { anilistId: "desc" } } } });
  if (!actor) notFound();
  const works = await prisma.catalogEntry.findMany({ where: { anilistId: { in: actor.roles.map((r) => r.anilistId) } }, select: { anilistId: true, titleRomaji: true, seasonYear: true } });
  const workById = new Map(works.map((w) => [w.anilistId as number, w]));
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Box sx={{ position: "relative", width: 160, aspectRatio: "3 / 4", borderRadius: "16px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>{actor.image && <CoverImage src={actor.image} sizes="160px" />}</Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 32, md: 40 }, lineHeight: 1.2 }}>
              {actor.name}
            </Typography>
            {actor.nativeName && (
              <Typography lang="ja" sx={{ fontSize: 18, color: "text.secondary" }}>
                {actor.nativeName}
              </Typography>
            )}
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Dublagem japonesa</Typography>
          </Box>
        </Box>
        <Box component="section" aria-labelledby="actor-roles" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography id="actor-roles" component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>
            Personagens na plataforma
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, display: "flex", flexDirection: "column", gap: 0.75 }}>
            {actor.roles.map((r) => {
              const work = workById.get(r.anilistId);
              return (
                <Box component="li" key={r.id} data-testid="actor-role" sx={{ fontSize: 15 }}>
                  <AppLink href={`/personagem/${r.characterId}`} underline="hover">
                    {r.character.name}
                  </AppLink>
                  {" em "}
                  <AppLink href={`/anime/${r.anilistId}`} underline="hover">
                    {work?.titleRomaji ?? `Obra #${r.anilistId}`}
                  </AppLink>
                  {work?.seasonYear ? ` (${work.seasonYear})` : ""}
                </Box>
              );
            })}
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
