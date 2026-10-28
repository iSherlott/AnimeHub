import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/LinkButton";
import { MyListTabs } from "@/components/MyListTabs";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ProfileAnimeList } from "@/components/ProfileAnimeList";
import { getCurrentUser } from "@/lib/auth/session";
import { pausedCount } from "@/lib/myListCounts";
import { prisma } from "@/lib/prisma";

/**
 * Pausados: a terceira "planilha" de Meus Animes. Obras que já terminaram de passar e a pessoa não terminou — marcadas
 * "Não terminei" ou com episódio adiado em "Para assistir". Mesma grade da aba Animes do perfil (busca, gênero, prévia e
 * andamento): marcar "Terminei" ou "Dropei" tira a obra daqui.
 */
export default async function PausadosPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver os seus pausados
          </Typography>
          <LinkButton href="/login?next=%2Fminha-lista%2Fpausados" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const [paused, pendingCount] = await Promise.all([pausedCount(user.id), prisma.pendingEpisode.count({ where: { userId: user.id } })]);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker="一時停止 / PAUSADOS"
          title="PAUSADOS"
          subtitle={
            <span data-testid="paused-count">
              {paused === 0 ? "Nada pausado." : `${paused} ${paused === 1 ? "anime já encerrado" : "animes já encerrados"} que você não terminou.`} Marque “Terminei” ou
              “Dropei” e ele sai daqui.
            </span>
          }
        />
        <Box sx={{ mt: 4 }}>
          <MyListTabs active="paused" pendingCount={pendingCount} pausedCount={paused} />
          <ProfileAnimeList
            userId={user.id}
            isOwnProfile
            category="paused"
            scrollKey="/minha-lista/pausados"
            emptyText="Nenhum anime pausado. Obras que já terminaram de passar e você marcou “Não terminei”, ou com episódio adiado, aparecem aqui."
          />
        </Box>
      </PageContainer>
    </Box>
  );
}
