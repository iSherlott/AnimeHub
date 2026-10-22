import { Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { specialsSummary, type FranchiseTimeline } from "@/lib/curation/timeline";

const plural = (kind: string, count: number) => (kind === "MOVIE" ? (count === 1 ? "filme" : "filmes") : kind === "OTHER" ? (count === 1 ? "outro" : "outros") : kind);

/**
 * Aviso dos especiais da obra (Epic 42): OVA, ODA e filmes são complementares, não fazem parte da linha principal e não geram
 * alerta de episódio — mas a pessoa precisa saber que existem. Vai junto da sinopse e leva à linha do tempo, onde eles
 * aparecem ramificados da história principal (Epic 46).
 */
export function SpecialsNotice({ timeline }: { timeline: FranchiseTimeline | null }) {
  const summary = timeline ? specialsSummary(timeline.specials.filter((s) => !s.current)) : [];
  if (summary.length === 0) return null;
  const text = summary.map((s) => `${s.count} ${plural(s.kind, s.count)}`).join(", ");
  return (
    <Typography data-testid="specials-notice" sx={{ fontSize: 14, color: "text.secondary", borderLeft: 3, borderColor: "secondary.main", pl: 1.5 }}>
      Esta obra tem {text} fora da linha principal da história: histórias complementares, opcionais para acompanhar. Veja na{" "}
      <AppLink href="#episodios" underline="hover">
        linha do tempo
      </AppLink>
      , onde aparecem ramificados da história principal.
    </Typography>
  );
}
