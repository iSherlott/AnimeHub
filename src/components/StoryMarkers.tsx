import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import type { StoryRelation } from "@/lib/story/context";
import { arcName, type ArcInfo } from "@/lib/story/versions";

/**
 * O que a pesquisa de reboot (Epic 48) acrescenta à linha do tempo dos episódios de uma obra: os cabeçalhos dos arcos e os dois
 * avisos de ponto de virada. Tudo pequeno e sem estado, para as duas listas de episódios (a da obra acompanhada e a pública).
 */
export type StoryMarkers = {
  /** Esta obra é o reboot e, a partir deste episódio, vai além do que a versão antiga contou. */
  beyondFrom: { episode: number; originalId: number; originalTitle: string } | null;
  /** Esta obra é a versão antiga: depois do último episódio, a história continua no reboot. */
  continuesIn: { anilistId: number; title: string; fromEpisode: number; arcName: string | null } | null;
};

export const NO_MARKERS: StoryMarkers = { beyondFrom: null, continuesIn: null };

export function ArcHeader({ arc, language }: { arc: ArcInfo; language: "pt" | "en" | "ja" }) {
  const range = arc.startEpisode === arc.endEpisode ? `EP ${arc.startEpisode}` : `EP ${arc.startEpisode}–${arc.endEpisode}`;
  return (
    <Box data-testid={`arc-${arc.position}`} sx={{ pt: 0.25, pb: 0.5 }}>
      <Typography component="span" sx={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>
        Arco {arc.position} · {range}
      </Typography>
      <Typography component="span" lang={language === "ja" && arc.nameJa ? "ja" : undefined} sx={{ display: "block", fontSize: 17, fontWeight: 700, overflowWrap: "anywhere" }}>
        {arcName(arc, language)}
      </Typography>
    </Box>
  );
}

export function BeyondNotice({ marker, arc, language }: { marker: NonNullable<StoryMarkers["beyondFrom"]>; arc: ArcInfo | null; language: "pt" | "en" | "ja" }) {
  return (
    <Box data-testid="story-beyond" sx={{ p: 1.5, borderRadius: "12px", border: 1, borderStyle: "dashed", borderColor: "secondary.main", bgcolor: "background.paper" }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>A partir do episódio {marker.episode}, o reboot vai além da versão antiga</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {arc ? `${arcName(arc, language)}: ` : ""}daqui em diante é história que{" "}
        <AppLink href={`/anime/${marker.originalId}`} underline="hover">
          {marker.originalTitle}
        </AppLink>{" "}
        nunca contou.
      </Typography>
    </Box>
  );
}

export function ContinuesNotice({ marker }: { marker: NonNullable<StoryMarkers["continuesIn"]> }) {
  return (
    <Box data-testid="story-continues" sx={{ p: 1.5, borderRadius: "12px", border: 1, borderStyle: "dashed", borderColor: "secondary.main", bgcolor: "background.paper" }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Aqui termina esta versão</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        A história continua em{" "}
        <AppLink href={`/anime/${marker.anilistId}`} underline="hover">
          {marker.title}
        </AppLink>
        , a partir do episódio {marker.fromEpisode}
        {marker.arcName ? ` (${marker.arcName})` : ""}.
      </Typography>
    </Box>
  );
}

/**
 * "Versões da história" (Epic 48), em Histórias relacionadas: aponta a outra versão (o reboot ou a versão antiga), diz o que o
 * reboot cobre e a partir de que episódio vai além. Cada versão tem a própria linha do tempo: uma não mostra o conteúdo da outra.
 */
export function VersionsCallout({ relations }: { relations: ReadonlyArray<StoryRelation> }) {
  if (relations.length === 0) return null;
  return (
    <Box data-testid="story-versions" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {relations.map((r) => {
        const year = r.other.seasonYear ? ` (${r.other.seasonYear})` : "";
        const arc = r.beyondArc ? (r.beyondArc.namePt ?? r.beyondArc.nameEn) : null;
        const beyond = r.coverage === "PARTIAL" && r.beyondFromEpisode !== null ? `episódio ${r.beyondFromEpisode}${arc ? ` (${arc})` : ""}` : null;
        return (
          <Box key={r.other.anilistId} data-testid={`story-version-${r.other.anilistId}`} data-role={r.role} sx={{ p: 2, borderRadius: "12px", border: 1, borderColor: "secondary.main", bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Chip size="small" color="secondary" label={r.role === "REBOOT" ? "Reboot" : "Versão antiga"} sx={{ fontWeight: 700 }} />
              <AppLink href={`/anime/${r.other.anilistId}`} underline="hover" sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                {r.role === "REBOOT" ? `Refaz ${r.other.titleRomaji}${year}` : `Refeita em ${r.other.titleRomaji}${year}`}
              </AppLink>
            </Box>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {r.role === "REBOOT"
                ? r.coverage === "PARTIAL"
                  ? `Esta versão conta a história de novo, do zero, e vai além da versão antiga: a partir do ${beyond} é história que ela nunca teve.`
                  : "Esta versão conta a mesma história de novo, do zero, e termina onde a versão antiga termina."
                : r.coverage === "PARTIAL"
                  ? `A história foi refeita do zero e o reboot continua além desta versão: a partir do ${beyond} do reboot há história que esta versão não tem.`
                  : "A história foi refeita do zero; o reboot conta o mesmo enredo."}
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>A linha do tempo de cada versão mostra só o conteúdo dela; a outra fica a um clique.</Typography>
            {r.note && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{r.note}</Typography>}
            {r.source && /^https?:\/\//.test(r.source) && (
              <AppLink href={r.source} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontSize: 12 }}>
                Fonte da pesquisa ↗
              </AppLink>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
