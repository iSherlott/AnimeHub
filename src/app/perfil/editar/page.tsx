import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer } from "@/components/PageShell";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar Perfil · Anime Hub" };

/** Editar Perfil (estilo Crunchyroll): banner, avatar de anime, nome, identificador e bio. Exige conta. */
export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/perfil/editar"));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <ProfileEditor
          me={{ id: user.id, displayName: user.displayName, handle: user.handle, bio: user.bio, avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl }}
        />
      </PageContainer>
    </Box>
  );
}
