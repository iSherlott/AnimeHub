import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { FeedView } from "@/components/FeedView";

/**
 * Página principal do app — o Feed, público (Instagram/Twitter deixam
 * navegar o feed sem conta; só interagir exige login). A lista pessoal
 * de quem tem conta mudou pra /minha-lista.
 */
export default function Home() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
        <FeedView />
      </Box>
    </Box>
  );
}
