"use client";

import Image from "next/image";
import NextLink from "next/link";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { AnimeTitle } from "@/components/AnimeTitle";

export type HeroBannerData = {
  id: string;
  titleRomaji: string;
  titleEnglish?: string | null;
  titleNative: string | null;
  titlePortuguese?: string | null;
  titleFurigana?: string | null;
  description: string | null;
  bannerImage: string | null;
  coverImage: string | null;
  accentColor?: string | null;
  genres: string[];
  primaryLink?: { platform: string; url: string } | null;
};

export function HeroBanner({
  id,
  titleRomaji,
  titleEnglish,
  titleNative,
  titlePortuguese,
  titleFurigana,
  description,
  bannerImage,
  coverImage,
  accentColor,
  genres,
  primaryLink,
}: HeroBannerData) {
  const backdrop = bannerImage ?? coverImage;

  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "flex-end",
        width: "100%",
        height: { xs: "52vh", sm: "62vh" },
        minHeight: 360,
        overflow: "hidden",
      }}
    >
      {backdrop ? (
        <Image src={backdrop} alt="" fill priority style={{ objectFit: "cover", objectPosition: "top" }} />
      ) : (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom right, rgba(228,0,43,0.4), #0b0b0d, #0b0b0d)",
          }}
        />
      )}

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: accentColor
            ? `linear-gradient(to top, #0b0b0d, ${accentColor}88, transparent)`
            : "linear-gradient(to top, #0b0b0d, rgba(11,11,13,0.55), transparent)",
        }}
      />

      <Box sx={{ position: "relative", zIndex: 1, maxWidth: 672, px: { xs: 3, sm: 5 }, pb: { xs: 5, sm: 7 } }}>
        {titleNative && (
          <Typography className="font-jp" variant="body2" sx={{ mb: 0.5, color: "text.secondary" }}>
            {titleNative}
          </Typography>
        )}
        <Typography
          variant="h2"
          component="h1"
          className="font-display"
          sx={{ textTransform: "uppercase", lineHeight: 1, fontSize: { xs: "2.5rem", sm: "4rem" } }}
        >
          <AnimeTitle
            titles={{ titleRomaji, titleEnglish, titleNative, titlePortuguese }}
            furiganaHtml={titleFurigana}
          />
        </Typography>

        {genres.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
            {genres.slice(0, 3).map((g) => (
              <Chip
                key={g}
                label={g}
                size="small"
                sx={{ bgcolor: "background.paper", fontWeight: 700, textTransform: "uppercase" }}
              />
            ))}
          </Stack>
        )}

        {description && (
          <Typography
            variant="body1"
            sx={{
              mt: 2,
              color: "text.secondary",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: "wrap" }}>
          {primaryLink ? (
            <Button component="a" href={primaryLink.url} target="_blank" rel="noopener noreferrer" variant="contained" size="large">
              ▶ Assistir na {primaryLink.platform}
            </Button>
          ) : (
            <Button component={NextLink} href={`/anime/${id}`} variant="contained" size="large">
              ▶ Vincular plataforma
            </Button>
          )}
          <Button component={NextLink} href={`/anime/${id}`} variant="outlined" color="inherit" size="large">
            ⓘ Mais informações
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
