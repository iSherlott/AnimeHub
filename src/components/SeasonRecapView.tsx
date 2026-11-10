"use client";

import NextLink from "next/link";
import { Box, Chip, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { CATEGORY_LABELS } from "@/lib/watchCategory";
import type { SeasonRecap } from "@/lib/seasonRecap";

type SeasonOption = { slug: string; label: string };

const CARD_SX = { border: 1, borderColor: "divider", borderRadius: "16px", bgcolor: "background.paper", p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } as const;

function useTitle() {
  const { preference } = useTitlePreference();
  return (w: { titleRomaji: string; titleEnglish: string | null }) =>
    resolveTitleTextLenient(preference, { titleRomaji: w.titleRomaji, titleEnglish: w.titleEnglish, titleNative: null, titlePortuguese: null }, "Anime");
}

/** Capa pequena que leva à obra (quando a obra tem página). */
function WorkThumb({ href, cover, title, caption, testId }: { href: string | null; cover: string | null; title: string; caption?: string; testId?: string }) {
  const body = (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", minWidth: 0 }}>
      <Box sx={{ position: "relative", width: 44, height: 62, borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
        {cover && <CoverImage src={cover} sizes="44px" />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>{title}</Typography>
        {caption && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{caption}</Typography>}
      </Box>
    </Box>
  );
  return (
    <Box component="li" data-testid={testId} sx={{ listStyle: "none" }}>
      {href ? (
        <Box component={NextLink} href={href} sx={{ color: "text.primary", textDecoration: "none", "&:hover p:first-of-type": { textDecoration: "underline" } }}>
          {body}
        </Box>
      ) : (
        body
      )}
    </Box>
  );
}

/**
 * Retrospectiva da temporada: números da própria lista (obras e andamento), barras de gêneros, as notas mais altas e o
 * que os amigos mais viram. Só leitura; a pessoa troca de temporada pelos atalhos.
 */
export function SeasonRecapView({ recap, seasons, currentSlug }: { recap: SeasonRecap; seasons: SeasonOption[]; currentSlug: string }) {
  const title = useTitle();
  const maxGenre = recap.topGenres[0]?.count ?? 0;
  const stats = [
    { key: "total", label: "Obras da temporada", value: recap.total },
    ...(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((key) => ({ key, label: CATEGORY_LABELS[key], value: recap.byCategory[key] })),
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }} data-testid="season-recap">
      <Box component="nav" aria-label="Escolher temporada" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {seasons.map((s) => (
          <Chip
            key={s.slug}
            component={NextLink}
            href={`/retrospectiva?temporada=${s.slug}`}
            clickable
            label={s.label}
            color={s.slug === currentSlug ? "primary" : "default"}
            variant={s.slug === currentSlug ? "filled" : "outlined"}
            aria-current={s.slug === currentSlug ? "page" : undefined}
          />
        ))}
      </Box>

      {recap.total === 0 ? (
        <Box sx={CARD_SX}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Nenhuma obra desta temporada na sua lista.</Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Acompanhe obras da temporada em Explorar para ver a sua retrospectiva aqui.
          </Typography>
          {recap.friendsTop.length > 0 && <FriendsTop recap={recap} title={title} />}
        </Box>
      ) : (
        <>
          <Box component="ul" data-testid="recap-stats" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 2 }}>
            {stats.map((s) => (
              <Box component="li" key={s.key} data-testid={`recap-stat-${s.key}`} sx={{ ...CARD_SX, gap: 0.5, p: 2 }}>
                <Typography sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: s.key === "total" ? "primary.main" : "text.primary" }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
            <Box component="section" aria-labelledby="recap-genres" sx={CARD_SX}>
              <Typography id="recap-genres" component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
                Gêneros que mais apareceram
              </Typography>
              {recap.signatureGenre && (
                <Typography data-testid="recap-signature" sx={{ fontSize: 14, color: "text.secondary" }}>
                  Sua temporada foi de <Box component="strong" sx={{ color: "text.primary" }}>{recap.signatureGenre}</Box>: mais da metade das suas obras.
                </Typography>
              )}
              {recap.topGenres.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>As obras desta temporada ainda não têm gênero no catálogo.</Typography>
              ) : (
                <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.25 }}>
                  {recap.topGenres.map((g) => (
                    <Box component="li" key={g.genre} data-testid="recap-genre" sx={{ display: "grid", gridTemplateColumns: "minmax(88px, 30%) minmax(0, 1fr) auto", gap: 1.5, alignItems: "center" }}>
                      <Typography sx={{ fontSize: 14, overflowWrap: "anywhere" }}>{g.genre}</Typography>
                      <Box aria-hidden sx={{ height: 10, borderRadius: "5px", bgcolor: "#171820", overflow: "hidden" }}>
                        <Box sx={{ height: "100%", width: `${Math.max(8, Math.round((g.count / maxGenre) * 100))}%`, bgcolor: "primary.main", borderRadius: "5px" }} />
                      </Box>
                      <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                        {g.count} {g.count === 1 ? "obra" : "obras"}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box component="section" aria-labelledby="recap-best" sx={CARD_SX}>
              <Typography id="recap-best" component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
                Suas notas mais altas
              </Typography>
              {recap.bestRated.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Dê nota às obras que você terminou para elas aparecerem aqui.</Typography>
              ) : (
                <Box component="ol" sx={{ m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {recap.bestRated.map((w) => (
                    <WorkThumb key={w.key} testId="recap-best-work" href={w.href} cover={w.coverImage} title={title(w)} caption={`Sua nota: ${w.userScore}`} />
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {recap.friendsTop.length > 0 && (
            <Box sx={CARD_SX}>
              <FriendsTop recap={recap} title={title} />
            </Box>
          )}

          <Box component="section" aria-labelledby="recap-all" sx={CARD_SX}>
            <Typography id="recap-all" component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
              Todas as obras da temporada na sua lista
            </Typography>
            <Box component="ul" sx={{ m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
              {recap.works.map((w) => (
                <WorkThumb key={w.key} testId="recap-work" href={w.href} cover={w.coverImage} title={title(w)} caption={w.category !== "other" ? CATEGORY_LABELS[w.category] : "Na lista"} />
              ))}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}

function FriendsTop({ recap, title }: { recap: SeasonRecap; title: ReturnType<typeof useTitle> }) {
  return (
    <Box component="section" aria-labelledby="recap-friends" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="recap-friends" component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
        O que seus amigos mais viram
      </Typography>
      <Box component="ol" sx={{ m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        {recap.friendsTop.map((w) => (
          <WorkThumb
            key={w.key}
            testId="recap-friend-work"
            href={w.href}
            cover={w.coverImage}
            title={title(w)}
            caption={`${w.friends} ${w.friends === 1 ? "amigo" : "amigos"}${w.mine ? " · você também" : ""}`}
          />
        ))}
      </Box>
    </Box>
  );
}
