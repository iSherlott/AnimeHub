import { Suspense } from "react";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { FeedView } from "@/components/FeedView";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { CommunitySidebar } from "@/components/CommunitySidebar";
import { PageContainer, PageIntro } from "@/components/PageShell";

/**
 * Feed (antes "Comunidade"; Figma "14 — Comunidade / Para você · Seguindo · Recentes", `13:41181`): as publicações e as
 * notícias, com hashtags como no Twitter/Instagram — "Em alta agora" e as conversas da temporada na lateral. A comunidade
 * de cada anime (o fórum) fica em /comunidades. Só de quem tem conta (sistema fechado). Publicar é no campo do topo do
 * Feed, como no X (`FeedComposer`); o editor completo continua em `/publicar`.
 */
export default function Home() {
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="フィード / FEED" title="Feed" subtitle="Notícias, impressões e hashtags do que está passando." />
        {/* A busca, pequena, fica no topo da lateral, acima de "Em alta agora"; no celular e no tablet, antes do Feed. */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" },
            gridTemplateAreas: { xs: `"search" "main" "aside"`, lg: `"main search" "main aside"` },
            gridTemplateRows: { lg: "auto 1fr" },
            columnGap: 5,
            rowGap: { xs: 3, lg: 3 },
            alignItems: "start",
          }}
        >
          <Box sx={{ gridArea: "search", minWidth: 0 }}>
            <CommunitySearchBox compact />
          </Box>
          <Box sx={{ gridArea: "main", minWidth: 0 }}>
            {/* useSearchParams em filhos exige um limite de Suspense no build estático. */}
            <Suspense>
              <FeedView />
            </Suspense>
          </Box>
          <Box component="aside" sx={{ gridArea: "aside", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <CommunitySidebar />
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
