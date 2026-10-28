import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer } from "@/components/PageShell";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { favoriteGenreOptions } from "@/lib/genres";
import { dropStaleProfileImages } from "@/lib/avatarOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar Perfil · Anime Hub" };

/** Editar Perfil (estilo Crunchyroll): banner, avatar e plano de fundo de anime, nome e bio; o @ aparece fixo. Exige conta. */
export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/perfil/editar"));
  // Imagem de um anime que a pessoa deixou de acompanhar volta ao padrão antes de mostrar o editor.
  const images = await dropStaleProfileImages(user.id);
  const [favorites, genreOptions] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { favoriteAnime: true, favoriteCharacter: true, favoriteGenres: true, birthDay: true, birthMonth: true } }), favoriteGenreOptions()]);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <ProfileEditor
          me={{ id: user.id, displayName: user.displayName, handle: user.handle, bio: user.bio, avatarUrl: images.avatarUrl, bannerUrl: images.bannerUrl, backgroundUrl: images.backgroundUrl, ...favorites }}
          genreOptions={genreOptions}
        />
      </PageContainer>
    </Box>
  );
}
