import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { SinglePostView } from "@/components/SinglePostView";
import { AppLink } from "@/components/AppLink";
import { FollowProductionButton } from "@/components/FollowProductionButton";
import { HashtagRow } from "@/components/HashtagRow";
import { PageContainer, SectionTitle } from "@/components/PageShell";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string }> };

/**
 * Página dedicada de discussão — leitura pública (Figma `13:42257`). A
 * lateral "Anime da conversa" vem do catálogo de produções (a associação é a
 * escolhida explicitamente na publicação, nunca uma hashtag ambígua).
 */
export default async function PublicationPage({ params }: Params) {
  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { deletedAt: true, anilistId: true, animeTitleRomaji: true, hashtags: { select: { hashtag: { select: { key: true, display: true } } } } },
  });
  const visible = post && !post.deletedAt ? post : null;
  const viewer = await getCurrentUser();

  let aside: React.ReactNode = null;
  if (visible?.anilistId) {
    const [production, owned] = await Promise.all([
      prisma.production.findUnique({ where: { anilistId: visible.anilistId } }),
      viewer ? prisma.anime.findFirst({ where: { userId: viewer.id, anilistId: visible.anilistId }, select: { id: true } }) : Promise.resolve(null),
    ]);
    const tags = visible.hashtags.map((h) => ({ key: h.hashtag.key, display: h.hashtag.display }));
    aside = (
      <>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <SectionTitle>Anime da conversa</SectionTitle>
          <Typography lang={production?.titleNative ? "ja" : undefined} sx={{ fontSize: 20, fontWeight: 700 }}>
            {production?.titleNative ?? production?.titleRomaji ?? visible.animeTitleRomaji}
          </Typography>
          {production?.titleEnglish && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{production.titleEnglish}</Typography>}
          {production?.format && (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {production.format}
              {production.seasonYear ? ` · ${production.seasonYear}` : ""}
            </Typography>
          )}
          <AppLink href={`/anime/${visible.anilistId}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Abrir detalhe ↗
          </AppLink>
          <Box>
            <FollowProductionButton anilistId={visible.anilistId} initialAnimeId={owned?.id ?? null} loggedIn={Boolean(viewer)} />
          </Box>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Acompanhar organiza sua agenda. Não segue o autor nem publica essa ação.</Typography>
          <HashtagRow tags={tags} />
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <SinglePostView postId={postId} aside={aside} />
      </PageContainer>
    </Box>
  );
}
