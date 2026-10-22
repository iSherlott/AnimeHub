import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
import type { Branch } from "@/lib/workJourney";

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

export const kindLabel = (kind: string | null) => KIND_LABELS[(kind ?? "OTHER") as Kind] ?? "Outros";

/** Uma ramificação da linha do tempo: OVA, ODA, filme ou outro, sempre opcional (fora da história principal). */
export function BranchCard({ branch }: { branch: Branch }) {
  const when = branch.season && branch.seasonYear ? `${SEASON_LABEL[branch.season] ?? branch.season} ${branch.seasonYear}` : branch.seasonYear ? String(branch.seasonYear) : null;
  const facts = [when, branch.episodes ? `${branch.episodes} ${branch.episodes === 1 ? "episódio" : "episódios"}` : null, branch.relationType ? (RELATION_LABEL[branch.relationType] ?? null) : null].filter(Boolean).join(" · ");
  const title = branch.titleNative ?? branch.titleRomaji;
  return (
    <Box data-testid={`branch-${branch.anilistId}`} sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1.5, borderRadius: "12px", border: 1, borderStyle: "dashed", borderColor: branch.current ? "primary.main" : "divider", bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" color="secondary" label={kindLabel(branch.kind)} sx={{ fontWeight: 700 }} data-testid={`branch-kind-${branch.anilistId}`} />
        <Chip size="small" variant="outlined" label="Opcional" />
      </Box>
      {branch.current ? (
        <Typography lang={branch.titleNative ? "ja" : undefined} sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>
          {title} <span style={{ fontWeight: 400, opacity: 0.7 }}>· você está aqui</span>
        </Typography>
      ) : (
        <AppLink href={`/anime/${branch.anilistId}`} underline="hover" lang={branch.titleNative ? "ja" : undefined} sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>
          {title}
        </AppLink>
      )}
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{facts || "—"}</Typography>
    </Box>
  );
}
