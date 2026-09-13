"use client";

import NextLink from "next/link";
import Image from "next/image";
import { Box, Card, CardActionArea, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import { statusColors } from "@/lib/muiTheme";
import {
  WATCH_STATUS_LABELS,
  type WatchStatus,
} from "@/lib/types";
import { resolveTitleText, useTitlePreference, type TitleSet } from "@/lib/titlePreference";

export type AnimeCardData = {
  id: string | number;
  href: string;
  titles: TitleSet;
  coverImage: string | null;
  episodes?: number | null;
  status?: WatchStatus;
  episodeProgress?: number;
};

const STATUS_COLOR_KEY: Record<WatchStatus, keyof typeof statusColors> = {
  WATCHING: "watching",
  COMPLETED: "completed",
  PLAN_TO_WATCH: "planned",
  PAUSED: "paused",
  DROPPED: "dropped",
};

export function AnimeCard({
  id,
  href,
  titles,
  coverImage,
  episodes,
  status,
  episodeProgress,
}: AnimeCardData) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, titles);

  const progressPct =
    status === "WATCHING" && episodes && episodes > 0
      ? Math.min(100, ((episodeProgress ?? 0) / episodes) * 100)
      : null;

  return (
    <Card data-testid={`anime-card-${id}`} sx={{ width: { xs: 144, sm: 176 }, flexShrink: 0 }}>
      <Tooltip title={title}>
        <CardActionArea component={NextLink} href={href}>
          <Box sx={{ position: "relative", aspectRatio: "2 / 3", width: "100%", overflow: "hidden" }}>
            {coverImage ? (
              <Image src={coverImage} alt="" fill sizes="192px" style={{ objectFit: "cover" }} />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  height: "100%",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "background.paper",
                  px: 1,
                  textAlign: "center",
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {title}
                </Typography>
              </Box>
            )}

            {status && (
              <Chip
                label={WATCH_STATUS_LABELS[status]}
                size="small"
                sx={{
                  position: "absolute",
                  top: 6,
                  left: 6,
                  height: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  bgcolor: statusColors[STATUS_COLOR_KEY[status]],
                  color: status === "WATCHING" ? "#f7f7f5" : "#0b0b0d",
                }}
              />
            )}

            {progressPct !== null && (
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  bgcolor: "rgba(0,0,0,0.6)",
                }}
              />
            )}
          </Box>

          <Box sx={{ p: 1 }}>
            <Typography variant="body2" noWrap>
              {title}
            </Typography>
            {episodes ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {episodeProgress ?? 0}/{episodes} eps
              </Typography>
            ) : null}
          </Box>
        </CardActionArea>
      </Tooltip>
    </Card>
  );
}
