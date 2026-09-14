import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/LinkButton";

/**
 * Sem isso, todo notFound() (anime/usuário/admin inexistente ou de outra
 * pessoa) caía na página 404 padrão do Next — sem cabeçalho, sem tema
 * escuro, sem volta pro app (achado real da 4ª rodada de auditoria,
 * Epic 18). Mesmo padrão visual das telas "Faça login"/"Lista vazia".
 */
export default function NotFound() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Header />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
        <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
          Página não encontrada
        </Typography>
        <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
          O link pode estar errado, ou o que você procura foi removido ou
          pertence a outra pessoa.
        </Typography>
        <LinkButton href="/" variant="contained" sx={{ mt: 1 }}>
          Voltar para a home
        </LinkButton>
      </Box>
    </Box>
  );
}
