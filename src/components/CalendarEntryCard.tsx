"use client";

import NextLink from "next/link";
import Image from "next/image";
import { Box, Card, CardActionArea, Tooltip, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

type CalendarEntryCardProps = {
  item: CalendarItem;
  variant?: "featured" | "compact";
};

export function CalendarEntryCard({ item, variant = "compact" }: CalendarEntryCardProps) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const time = new Date(item.airingAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isInternal = Boolean(item.inMyList && item.animeId);

  if (variant === "featured") {
    const content = (
      <Box sx={{ position: "relative", aspectRatio: "3 / 4", width: "100%", overflow: "hidden", bgcolor: "background.paper" }}>
        {item.coverImage ? (
          <Image
            src={item.coverImage}
            alt=""
            fill
            sizes="(min-width: 1024px) 140px, 45vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <Box sx={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center", px: 1, textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {title}
            </Typography>
          </Box>
        )}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.1), transparent)",
          }}
        />
        <Box
          role="img"
          aria-label="Já está na sua lista"
          sx={{
            position: "absolute",
            right: 4,
            top: 4,
            display: "flex",
            height: 20,
            width: 20,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            bgcolor: "rgba(0,0,0,0.7)",
            color: "secondary.main",
            fontSize: 12,
          }}
        >
          ★
        </Box>
        <Box sx={{ position: "absolute", insetInline: 0, bottom: 0, p: 0.75 }}>
          <Typography
            className="font-display"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontSize: 11,
              textTransform: "uppercase",
              lineHeight: 1.3,
              color: "text.primary",
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 10, fontWeight: 700, color: "secondary.main" }}>
            EP {item.episode} · {time}
          </Typography>
        </Box>
      </Box>
    );

    return (
      <Card sx={{ position: "relative" }}>
        {isInternal ? (
          <Tooltip title={title}>
            <CardActionArea component={NextLink} href={`/anime/${item.animeId}`}>
              {content}
            </CardActionArea>
          </Tooltip>
        ) : (
          <Tooltip title={title}>
            <CardActionArea component="a" href={`https://anilist.co/anime/${item.anilistId}`} target="_blank" rel="noopener noreferrer">
              {content}
            </CardActionArea>
          </Tooltip>
        )}
      </Card>
    );
  }

  const compactContent = (
    <>
      <Box sx={{ position: "relative", height: 44, width: 32, flexShrink: 0, overflow: "hidden", bgcolor: "background.default" }}>
        {item.coverImage ? <Image src={item.coverImage} alt="" fill sizes="32px" style={{ objectFit: "cover" }} /> : null}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: 10, lineHeight: 1.3, color: "text.secondary" }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 10, color: "text.secondary" }}>
          EP {item.episode} · {time}
        </Typography>
      </Box>
    </>
  );

  const compactSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    borderLeft: 2,
    borderColor: item.inMyList ? "secondary.main" : "divider",
    bgcolor: "background.paper",
    p: 0.75,
    textDecoration: "none",
    transition: "background-color 0.15s ease",
    "&:hover": { bgcolor: "background.default", borderColor: "primary.main" },
  } as const;

  return (
    <Tooltip title={title}>
      {isInternal ? (
        <Box component={NextLink} href={`/anime/${item.animeId}`} sx={compactSx}>
          {compactContent}
        </Box>
      ) : (
        <Box
          component="a"
          href={`https://anilist.co/anime/${item.anilistId}`}
          target="_blank"
          rel="noopener noreferrer"
          sx={compactSx}
        >
          {compactContent}
        </Box>
      )}
    </Tooltip>
  );
}
