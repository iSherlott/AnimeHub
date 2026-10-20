import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
import { specialsSummary, type FranchiseTimeline } from "@/lib/curation/timeline";

const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
const RELATION_LABEL: Record<string, string> = {
  SIDE_STORY: "História paralela",
  SUMMARY: "Resumo",
  ALTERNATIVE: "Versão alternativa",
  SPIN_OFF: "Spin-off",
  PARENT: "Da obra principal",
  SEQUEL: "Continuação",
  PREQUEL: "Antes da história",
};

const kindLabel = (kind: string | null) => KIND_LABELS[(kind ?? "OTHER") as Kind] ?? "Outros";
const plural = (kind: string, count: number) => (kind === "MOVIE" ? (count === 1 ? "filme" : "filmes") : kind === "OTHER" ? (count === 1 ? "outro" : "outros") : kind);

/**
 * Aviso e lista dos especiais da obra (Epic 42): OVA, ODA e filmes são complementares, não fazem parte da linha principal e
 * não geram alerta de episódio — mas a pessoa precisa saber que existem. `notice` é o aviso curto (vai junto da sinopse).
 */
export function SpecialsNotice({ timeline }: { timeline: FranchiseTimeline | null }) {
  const summary = timeline ? specialsSummary(timeline.specials.filter((s) => !s.current)) : [];
  if (summary.length === 0) return null;
  const text = summary.map((s) => `${s.count} ${plural(s.kind, s.count)}`).join(", ");
  return (
    <Typography data-testid="specials-notice" sx={{ fontSize: 14, color: "text.secondary", borderLeft: 3, borderColor: "secondary.main", pl: 1.5 }}>
      Esta obra tem {text} fora da linha principal da história: histórias complementares, opcionais para acompanhar. Veja em{" "}
      <AppLink href="#especiais" underline="hover">
        Especiais e filmes
      </AppLink>
      .
    </Typography>
  );
}

export function WorkSpecials({ timeline }: { timeline: FranchiseTimeline | null }) {
  const specials = timeline?.specials ?? [];
  if (specials.length === 0) return null;
  return (
    <Box component="section" id="especiais" aria-labelledby="especiais-heading" data-testid="work-specials" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 80 }}>
      <Typography id="especiais-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        Especiais e filmes
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        OVA, ODA e filmes são complementares: não fazem parte da linha principal da história e não geram alerta de episódio.
      </Typography>
      <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
        {specials.map((s) => {
          const when = s.season && s.seasonYear ? `${SEASON_LABEL[s.season] ?? s.season} ${s.seasonYear}` : s.seasonYear ? String(s.seasonYear) : null;
          const facts = [when, s.episodes ? `${s.episodes} ${s.episodes === 1 ? "episódio" : "episódios"}` : null, s.relationType ? RELATION_LABEL[s.relationType] ?? null : null].filter(Boolean).join(" · ");
          return (
            <Box component="li" key={s.anilistId} data-testid={`special-${s.anilistId}`} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, borderRadius: "12px", border: 1, borderColor: s.current ? "primary.main" : "divider", bgcolor: "background.paper" }}>
              <Box sx={{ position: "relative", flexShrink: 0, width: 48, aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>{s.coverImage && <CoverImage src={s.coverImage} sizes="48px" />}</Box>
              <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Chip size="small" label={kindLabel(s.kind)} sx={{ fontWeight: 700 }} data-testid={`special-kind-${s.anilistId}`} />
                  <Chip size="small" variant="outlined" label="Opcional" />
                </Box>
                {s.current ? (
                  <Typography lang={s.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {s.titleNative ?? s.titleRomaji} <span style={{ fontWeight: 400, opacity: 0.7 }}>· você está aqui</span>
                  </Typography>
                ) : (
                  <AppLink href={`/anime/${s.anilistId}`} underline="hover" lang={s.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {s.titleNative ?? s.titleRomaji}
                  </AppLink>
                )}
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{facts || "—"}</Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
