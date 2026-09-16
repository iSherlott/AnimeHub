"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

type ThreadSummary = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  commentCount: number;
  lastCommentAt: string | null;
};

function ThreadRow({ thread }: { thread: ThreadSummary }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, {
    titleRomaji: thread.titleRomaji,
    titleEnglish: thread.titleEnglish,
  });
  const [coverBroken, setCoverBroken] = useState(false);

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          overflow: "hidden",
          flexShrink: 0,
          bgcolor: "background.default",
        }}
      >
        {thread.coverImage && !coverBroken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.coverImage}
            alt=""
            onError={() => setCoverBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <MuiLink
          component={NextLink}
          // Comment é por anilistId, não por linha de Anime do viewer —
          // nem todo mundo que vê a lateral tem esse anime na própria
          // lista (posse é por usuário) — leva pra busca do Descobrir
          // (sempre pública) em vez de /anime/[id] (exige posse).
          href={`/discover?search=${encodeURIComponent(thread.titleRomaji)}`}
          underline="hover"
          sx={{ color: "text.primary", fontSize: 13, fontWeight: 600, display: "block" }}
          noWrap
        >
          {title}
        </MuiLink>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {thread.commentCount} {thread.commentCount === 1 ? "comentário" : "comentários"}
        </Typography>
      </Box>
    </Stack>
  );
}

function ThreadSection({ title, threads }: { title: string; threads: ThreadSummary[] }) {
  if (threads.length === 0) return null;
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}
      >
        {title}
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {threads.map((t) => (
          <ThreadRow key={t.anilistId} thread={t} />
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Lateral do Feed (Epic 25) — "trending topics" de thread de anime (Epic
 * 15: comentário por anime, não os comentários dentro de post do Feed).
 * Pública, busca uma vez ao montar.
 */
export function AnimeThreadsSidebar() {
  const [recent, setRecent] = useState<ThreadSummary[]>([]);
  const [mostCommentedToday, setMostCommentedToday] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/anime-threads/trending")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setRecent(data.recent ?? []);
        setMostCommentedToday(data.mostCommentedToday ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || (recent.length === 0 && mostCommentedToday.length === 0)) return null;

  return (
    <Stack spacing={3} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
      <ThreadSection title="Threads recentes" threads={recent} />
      <ThreadSection title="Mais comentadas hoje" threads={mostCommentedToday} />
    </Stack>
  );
}
