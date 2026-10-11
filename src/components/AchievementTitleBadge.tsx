import { Box } from "@mui/material";

/**
 * Título cosmético equipado (Figma `AchievementTitleBadge`, `42:3461`): pílula roxa com "称号 · <título>".
 * Aparece sob o autor em perfil, publicações e respostas. Sem título equipado o chamador não renderiza
 * nada (nunca um badge vazio).
 */
export function AchievementTitleBadge({ title, owned = false }: { title: string; owned?: boolean }) {
  return (
    <Box
      component="span"
      data-testid="title-badge"
      sx={{
        display: "inline-flex",
        alignSelf: "flex-start",
        px: 1,
        py: 0.5,
        borderRadius: "10px",
        bgcolor: "#1b152b",
        color: "#8b5cf6",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        border: owned ? "1px solid #8b5cf6" : undefined,
      }}
    >
      <span lang="ja">称号</span>&nbsp;·&nbsp;{title}
    </Box>
  );
}
