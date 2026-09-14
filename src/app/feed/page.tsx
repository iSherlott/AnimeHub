import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { FeedView } from "@/components/FeedView";
import { LinkButton } from "@/components/LinkButton";
import { getCurrentUser } from "@/lib/auth/session";

export default async function FeedPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver o feed
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            O feed da comunidade é só pra quem tem conta.
          </Typography>
          <LinkButton href="/login" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase", mb: 3 }}>
          Feed
        </Typography>
        <FeedView />
      </Box>
    </Box>
  );
}
