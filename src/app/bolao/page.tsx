import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { SeasonPoolView } from "@/components/SeasonPoolView";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { currentPool } from "@/lib/seasonPool";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bolão da temporada · Anime Hub" };

/** Bolão da temporada (10/11/2026): a administração abre; cada pessoa aposta nas obras da temporada. */
export default async function SeasonPoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/bolao"));
  const pool = await currentPool(user.id);
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="予想 / BOLÃO" title={pool?.title ?? "Bolão da temporada"} subtitle="Aposte nas obras que vão bombar na temporada e dispute com a rede." />
        {pool ? (
          <SeasonPoolView initial={pool} viewerId={user.id} />
        ) : (
          <Typography sx={{ color: "text.secondary" }}>Nenhum bolão aberto. A administração abre um no começo de cada temporada.</Typography>
        )}
      </PageContainer>
    </Box>
  );
}
