import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/LinkButton";
import { MyListTabs } from "@/components/MyListTabs";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { PendingListView } from "@/components/PendingListView";
import { getCurrentUser } from "@/lib/auth/session";
import { listPending } from "@/lib/pending";

/**
 * Para assistir: a outra "planilha" ao lado de Minha Lista. Guarda os episódios que a pessoa adiou no
 * calendário (botão "Adiar"), com o episódio em que parou e, se a obra ainda está saindo, até onde já saiu.
 */
export default async function PendenciasPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver o que falta assistir
          </Typography>
          <LinkButton href="/login?next=%2Fminha-lista%2Fpendencias" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const entries = await listPending(user.id);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker="あとで見る / PARA ASSISTIR"
          title="PARA ASSISTIR"
          subtitle={
            <span data-testid="pending-count">
              {entries.length === 0 ? "Nada pendente." : `${entries.length} ${entries.length === 1 ? "anime" : "animes"} com episódios adiados.`} Adie um episódio pelo calendário e ele aparece aqui.
            </span>
          }
        />
        <Box sx={{ mt: 4 }}>
          <MyListTabs active="pending" pendingCount={entries.length} />
          {entries.length === 0 ? (
            <Box data-testid="pending-empty" sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
              <Typography sx={{ color: "text.secondary" }}>
                Quando um episódio do dia ficar para depois, use “Adiar” no calendário. Ele fica aqui com o episódio em que você parou.
              </Typography>
              <LinkButton href="/calendar" variant="contained">
                Abrir calendário
              </LinkButton>
            </Box>
          ) : (
            <PendingListView entries={entries} />
          )}
        </Box>
      </PageContainer>
    </Box>
  );
}
