import { Suspense } from "react";
import { Box, Typography } from "@mui/material";
import { LinkButton } from "@/components/LinkButton";
import { Header } from "@/components/Header";
import { FeedView } from "@/components/FeedView";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { CommunitySidebar } from "@/components/CommunitySidebar";
import { PageContainer, PageIntro, TwoColumn } from "@/components/PageShell";

/**
 * Feed (antes "Comunidade"; Figma "14 — Comunidade / Para você · Seguindo · Recentes", `13:41181`): as publicações e as
 * notícias, com hashtags como no Twitter/Instagram — "Em alta agora" e as conversas da temporada na lateral. A comunidade
 * de cada anime (o fórum) fica em /comunidades. Pública: só interagir exige conta (`/publicar` pede login e volta).
 */
export default function Home() {
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="フィード / FEED"
          title="Feed"
          subtitle="Notícias, impressões e hashtags do que está passando."
          action={
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <LinkButton href="/comunidades" variant="outlined" data-testid="home-my-communities">
                Minhas comunidades
              </LinkButton>
              <LinkButton href="/publicar" variant="contained" color="primary">
                + Nova publicação
              </LinkButton>
            </Box>
          }
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 320px" }, columnGap: 5, rowGap: 2, alignItems: "start" }}>
          <CommunitySearchBox />
          <Box sx={{ pt: { lg: "26px" }, display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Publicações, perfis e hashtags.</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>A busca social fica aqui, não no menu principal.</Typography>
          </Box>
        </Box>
        <TwoColumn
          main={
            // useSearchParams em filhos exige um limite de Suspense no build estático.
            <Suspense>
              <FeedView />
            </Suspense>
          }
          aside={<CommunitySidebar />}
        />
      </PageContainer>
    </Box>
  );
}
