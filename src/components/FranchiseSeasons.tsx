import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import { SeasonControls, type MySeason } from "@/components/SeasonControls";
import { SynopsisText } from "@/components/SynopsisText";
import type { SeasonEntry } from "@/lib/franchiseSeasons";

const STATUS_LABEL: Record<string, string> = {
  RELEASING: "Em exibição",
  FINISHED: "Finalizado",
  NOT_YET_RELEASED: "Em breve",
  CANCELLED: "Cancelado",
  HIATUS: "Em hiato",
};
const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial", MUSIC: "Música" };

/**
 * "Temporadas": as temporadas da obra juntas, em ordem, cada uma com situação, época, episódios e a própria sinopse
 * (a da temporada que você está vendo já está em "Sinopse", logo acima; as outras abrem com um clique). Só aparece quando há mais de uma.
 */
/** `mine`: as temporadas que a pessoa tem na lista (por anilistId); `signedIn` liga os controles de andamento. */
export function FranchiseSeasons({ seasons, mine = {}, signedIn = false }: { seasons: SeasonEntry[]; mine?: Record<number, MySeason>; signedIn?: boolean }) {
  if (seasons.length < 2) return null;
  return (
    <Box component="section" aria-labelledby="temporadas-heading" data-testid="franchise-seasons" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="temporadas-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        Temporadas
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        {seasons.length} temporadas desta obra, da primeira à mais recente. Abra uma para ler a sinopse dela.
      </Typography>
      <Box component="ol" sx={{ display: "flex", flexDirection: "column", gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
        {seasons.map((s) => {
          const when = s.season && s.seasonYear ? `${SEASON_LABEL[s.season] ?? s.season} ${s.seasonYear}` : s.seasonYear ? String(s.seasonYear) : null;
          const facts = [when, s.format ? (FORMAT_LABEL[s.format] ?? s.format) : null, s.episodes ? `${s.episodes} ${s.episodes === 1 ? "episódio" : "episódios"}` : null].filter(Boolean).join(" · ");
          return (
            <Box
              component="li"
              key={s.anilistId}
              data-testid={`season-${s.anilistId}`}
              data-current={s.current ? "true" : undefined}
              sx={{ borderRadius: "12px", border: 1, borderColor: s.current ? "primary.main" : "divider", bgcolor: "background.paper", overflow: "hidden" }}
            >
              <Box component={s.current ? "div" : "details"} sx={{ "& > summary": { listStyle: "none", cursor: "pointer", "&::-webkit-details-marker": { display: "none" } } }}>
                <Box component={s.current ? "div" : "summary"} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: -2 } }}>
                  <Box sx={{ position: "relative", flexShrink: 0, width: 48, aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>
                    {s.coverImage && <CoverImage src={s.coverImage} sizes="48px" />}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.25 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: s.current ? "primary.light" : "text.secondary", textTransform: "uppercase" }}>
                      Temporada {s.seasonNumber}
                      {s.current ? " · você está aqui (sinopse acima)" : ""}
                    </Typography>
                    <Typography lang={s.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                      {s.titleNative ?? s.titleRomaji}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{[s.status ? (STATUS_LABEL[s.status] ?? s.status) : null, facts].filter(Boolean).join(" · ") || "—"}</Typography>
                  </Box>
                </Box>
                {!s.current && (
                  <Box sx={{ px: 1.5, pb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <SynopsisText description={s.description} anilistId={s.anilistId} stored={s.stored} sx={{ fontSize: 14, color: "text.secondary" }} data-testid={`season-synopsis-${s.anilistId}`} />
                    <Box>
                      <AppLink href={`/anime/${s.anilistId}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700 }}>
                        Abrir a Temporada {s.seasonNumber}
                      </AppLink>
                    </Box>
                  </Box>
                )}
              </Box>
              {signedIn && (
                <Box sx={{ px: 1.5, pb: 1.5 }}>
                  <SeasonControls anilistId={s.anilistId} seasonNumber={s.seasonNumber} mine={mine[s.anilistId] ?? null} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
