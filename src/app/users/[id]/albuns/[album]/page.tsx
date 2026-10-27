import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ProfileSection } from "@/components/profile/ProfileSections";
import { AlbumEditor, AlbumRemoveItem } from "@/components/profile/ProfileAlbums";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { albumCandidates, albumView, type AlbumWork } from "@/lib/profileAlbums";

export const dynamic = "force-dynamic";

/** Capa e título da obra no álbum. */
function WorkCard({ work }: { work: AlbumWork }) {
  return (
    <>
      <Box sx={{ position: "relative", aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820" }}>{work.coverImage && <CoverImage src={work.coverImage} sizes="180px" />}</Box>
      <Typography className="work-title" sx={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>
        <AnimeTitle titles={{ titleRomaji: work.titleRomaji, titleEnglish: work.titleEnglish, titleNative: work.titleNative }} />
      </Typography>
    </>
  );
}

type Props = { params: Promise<{ id: string; album: string }> };

/**
 * Um álbum do perfil: automático (pelo andamento) ou montado pela pessoa. As obras levam à página do anime; no próprio
 * álbum personalizado, a pessoa renomeia, apaga, tira e coloca obras da lista dela.
 */
export default async function AlbumPage({ params }: Props) {
  const { id, album } = await params;
  const owner = await prisma.user.findUnique({ where: { id }, select: { displayName: true } });
  if (!owner) notFound();
  const viewer = await getCurrentUser();
  const view = await albumView(id, viewer?.id ?? null, album);
  if (!view) notFound();
  const editable = view.isOwn && !view.auto;
  const candidates = editable ? await albumCandidates(id) : [];

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="アルバム / ÁLBUM" title={view.name} subtitle={view.description ?? (view.auto ? "Álbum automático: segue o andamento de cada anime." : `Álbum de ${owner.displayName}.`)} />
        <AppLink href={`/users/${id}#albuns`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← {view.isOwn ? "Meu perfil" : `Perfil de ${owner.displayName}`}
        </AppLink>
        {editable && <AlbumEditor userId={id} albumId={album} name={view.name} description={view.description} inAlbum={view.works.flatMap((w) => (w.animeId ? [w.animeId] : []))} candidates={candidates} />}
        <ProfileSection id="obras" title="animes" count={view.works.length} testId="album-works">
          {view.works.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{editable ? "Álbum vazio: coloque animes da sua lista acima." : "Nenhum anime neste álbum."}</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(4, minmax(0,1fr))", md: "repeat(5, minmax(0,1fr))" }, gap: 2 }}>
              {view.works.map((w) => (
                <Box component="li" key={w.animeId ?? w.key} data-testid={`album-work-${w.key}`} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {w.href ? (
                    <AppLink href={w.href} underline="none" sx={{ display: "flex", flexDirection: "column", gap: 0.75, color: "text.primary", "&:hover .work-title": { textDecoration: "underline" } }}>
                      <WorkCard work={w} />
                    </AppLink>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                      <WorkCard work={w} />
                    </Box>
                  )}
                  {editable && w.animeId && <AlbumRemoveItem albumId={album} animeId={w.animeId} testId={`album-remove-${w.key}`} />}
                </Box>
              ))}
            </Box>
          )}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}
