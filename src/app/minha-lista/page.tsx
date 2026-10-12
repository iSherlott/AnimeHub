import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/LinkButton";
import AddIcon from "@mui/icons-material/Add";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { MyListTabs } from "@/components/MyListTabs";
import { MyListView } from "@/components/MyListView";
import { prisma } from "@/lib/prisma";
import { loadMyListEntries } from "@/lib/myList";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Minha Lista (Figma `8:2608`, D-02 aprovada): privada, agrupada pela data
 * do próximo lançamento. Sem status de consumo, contador de episódios,
 * nota ou "Continuar assistindo".
 */
export default async function MinhaListaPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver sua lista
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            O feed, Descobrir e o calendário de lançamentos continuam livres
            pra navegar sem conta — só a sua lista pessoal precisa de login.
          </Typography>
          <LinkButton href="/login?next=%2Fminha-lista" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const [entries, pendingCount] = await Promise.all([loadMyListEntries(user.id), prisma.pendingEpisode.count({ where: { userId: user.id } })]);

  if (entries.length === 0) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Você ainda não está acompanhando nenhum anime.
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            Encontre uma história e acompanhe para ver suas próximas datas aqui.
          </Typography>
          <LinkButton href="/discover" variant="contained" sx={{ mt: 1 }}>
            Explorar animes
          </LinkButton>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker="マイリスト / ORGANIZAÇÃO PESSOAL"
          title="MINHA LISTA"
          subtitle={
            <span data-testid="list-count">
              {entries.length} {entries.length === 1 ? "anime acompanhando" : "animes acompanhando"}. A próxima data é o que importa.
            </span>
          }
          action={
            <LinkButton href="/discover" startIcon={<AddIcon />} sx={{ bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } }}>
              Explorar animes
            </LinkButton>
          }
        />
        <Box sx={{ mt: 4 }}>
          <MyListTabs active="list" pendingCount={pendingCount} />
          <MyListView entries={entries} />
        </Box>
      </PageContainer>
    </Box>
  );
}
