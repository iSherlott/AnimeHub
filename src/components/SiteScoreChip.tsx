import { Chip } from "@mui/material";

/**
 * Nota do site (Epic 42): feita pelos usuários, não pela AniList nem pela AniDB. Toda obra começa em 5 e vai sendo regulada
 * pelas notas de quem terminou de assistir.
 */
export function SiteScoreChip({ score, votes }: { score: number; votes: number }) {
  return (
    <Chip
      data-testid="site-score"
      label={`Nota do site ${score.toFixed(1)}`}
      title={votes > 0 ? `Média das notas de ${votes} ${votes === 1 ? "pessoa que terminou" : "pessoas que terminaram"} a obra (começa em 5)` : "Ainda sem notas: toda obra começa em 5 e é regulada por quem termina de assistir"}
      size="small"
      sx={{ bgcolor: "secondary.main", color: "#0b0b0d", fontWeight: 700 }}
    />
  );
}
