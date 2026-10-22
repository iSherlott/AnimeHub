import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
import type { FranchiseStep } from "@/lib/curation/franchiseTimelineLoader";

const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
/** Quantos passos aparecem de cara; o resto abre com um clique (franquias grandes têm mais de cem obras). */
const VISIBLE = 12;

const kindLabel = (kind: string | null) => KIND_LABELS[(kind ?? "OTHER") as Kind] ?? "Outros";

function stepLabel(step: FranchiseStep): string {
  if (step.role === "MAIN") return `Temporada ${step.season}`;
  if (step.role === "RELATED") return "Série relacionada";
  return kindLabel(step.kind);
}

function Step({ step }: { step: FranchiseStep }) {
  const when = step.seasonName && step.seasonYear ? `${SEASON_LABEL[step.seasonName] ?? step.seasonName} ${step.seasonYear}` : step.seasonYear ? String(step.seasonYear) : null;
  const facts = [when, step.episodes ? `${step.episodes} ${step.episodes === 1 ? "episódio" : "episódios"}` : null].filter(Boolean).join(" · ");
  const title = step.titleNative ?? step.titleRomaji;
  return (
    <Box component="li" data-testid={`timeline-step-${step.anilistId}`} data-role={step.role} data-current={step.current ? "true" : undefined} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, borderRadius: "12px", border: 1, borderColor: step.current ? "primary.main" : "divider", bgcolor: "background.paper" }}>
      <Box sx={{ position: "relative", flexShrink: 0, width: 48, aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>{step.coverImage && <CoverImage src={step.coverImage} sizes="48px" />}</Box>
      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Chip size="small" color={step.role === "MAIN" ? "primary" : "default"} label={stepLabel(step)} sx={{ fontWeight: 700 }} />
          {step.role === "SPECIAL" && <Chip size="small" variant="outlined" label="Opcional" />}
        </Box>
        {step.current ? (
          <Typography lang={step.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
            {title} <span style={{ fontWeight: 400, opacity: 0.7 }}>· você está aqui</span>
          </Typography>
        ) : (
          <AppLink href={`/anime/${step.anilistId}`} underline="hover" lang={step.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
            {title}
          </AppLink>
        )}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{facts || "—"}</Typography>
      </Box>
    </Box>
  );
}

/**
 * "Linha do tempo da franquia" (Epic 45): a obra inteira em ordem de estreia, com as temporadas da linha principal numeradas
 * e os OVA, ODA e filmes marcados como opcionais. A parte que contém a obra aberta nunca fica escondida.
 */
export function FranchiseTimeline({ steps }: { steps: FranchiseStep[] | null }) {
  if (!steps || steps.length < 2) return null;
  const currentIndex = steps.findIndex((s) => s.current);
  // Janela fixa no começo; se a obra atual está além dela, a janela vai até ela para não escondê-la.
  const shown = Math.max(VISIBLE, currentIndex + 1);
  const head = steps.slice(0, shown);
  const rest = steps.slice(shown);
  const specials = steps.filter((s) => s.role === "SPECIAL").length;
  const main = steps.filter((s) => s.role === "MAIN").length;
  return (
    <Box component="section" aria-labelledby="linha-do-tempo-heading" data-testid="franchise-timeline" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="linha-do-tempo-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        Linha do tempo da franquia
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="franchise-timeline-summary">
        {steps.length} obras em ordem de estreia: {main} {main === 1 ? "temporada" : "temporadas"} da linha principal e {specials} {specials === 1 ? "especial opcional" : "especiais opcionais"} (OVA, ODA, filmes).
      </Typography>
      <Box component="ol" sx={{ display: "flex", flexDirection: "column", gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
        {head.map((s) => (
          <Step key={s.anilistId} step={s} />
        ))}
      </Box>
      {rest.length > 0 && (
        <Box component="details" data-testid="franchise-timeline-more">
          <Box component="summary" sx={{ cursor: "pointer", fontSize: 14, fontWeight: 700, mb: 1.5, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}>
            Ver as outras {rest.length} obras
          </Box>
          <Box component="ol" start={shown + 1} sx={{ display: "flex", flexDirection: "column", gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
            {rest.map((s) => (
              <Step key={s.anilistId} step={s} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
