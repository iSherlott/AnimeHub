import { Suspense } from "react";
import { Box, Stack } from "@mui/material";
import { Header } from "@/components/Header";
import { FeedView } from "@/components/FeedView";
import { AnimeThreadsSidebar } from "@/components/AnimeThreadsSidebar";

/**
 * Página principal do app — o Feed, público (Instagram/Twitter deixam
 * navegar o feed sem conta; só interagir exige login). A lista pessoal
 * de quem tem conta mudou pra /minha-lista.
 *
 * Layout de 2 colunas a partir de "lg" (Epic 25) — lateral de threads de
 * anime some abaixo disso, mesmo espírito responsivo do resto do app.
 */
export default function Home() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Stack
        direction="row"
        spacing={3}
        sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 }, alignItems: "flex-start" }}
      >
        <Box sx={{ maxWidth: 640, mx: "auto", flex: 1, minWidth: 0 }}>
          {/* useSearchParams (modo citação vindo do perfil de outra
              pessoa) exige um limite de Suspense — sem isso o build
              estático da rota falha. */}
          <Suspense>
            <FeedView />
          </Suspense>
        </Box>
        <Box sx={{ width: 320, flexShrink: 0, display: { xs: "none", lg: "block" }, position: "sticky", top: 88 }}>
          <AnimeThreadsSidebar />
        </Box>
      </Stack>
    </Box>
  );
}
