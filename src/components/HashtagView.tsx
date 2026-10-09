"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Box, Chip, Link as MuiLink, Stack, Tab, Tabs, Typography } from "@mui/material";
import { UserPostList } from "@/components/UserPostList";

type Related = Record<string, Array<{ key: string; display: string }>>;

const KIND_LABEL: Record<string, string> = {
  WORK: "OBRAS",
  SEASON: "TEMPORADA",
  GENRE: "GÊNEROS",
  TOPIC: "TÓPICOS",
};
const KIND_ORDER = ["WORK", "SEASON", "GENRE", "TOPIC"];

/**
 * Página de hashtag (Figma `13:42068`): "Recentes" (cronológico) e "Em alta"
 * (atividade recente NESTA tag — critério/janela pendentes, proposta 72 h),
 * com a lateral "Encontre outra conversa" por tipo. A hashtag não associa
 * nenhuma obra.
 */
export function HashtagView({ hashtagKey, display, kind }: { hashtagKey: string; display: string; kind: string }) {
  const [tab, setTab] = useState<"recent" | "trending">("recent");
  const [count, setCount] = useState<number | null>(null);
  const [related, setRelated] = useState<Related>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hashtags/${encodeURIComponent(hashtagKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCount(data.hashtag.postCount);
        setRelated(data.related ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hashtagKey]);

  return (
    <Box>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {KIND_LABEL[kind] ?? "TÓPICOS"}
      </Typography>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 800 }}>
        #{display}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }} data-testid="hashtag-count">
        {count === null ? "" : `${count} ${count === 1 ? "publicação" : "publicações"}`}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
        Recentes: ordem cronológica. Em alta: descoberta por atividade recente nesta hashtag; critérios e janela de tempo ainda
        em definição.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={4} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Recentes" value="recent" />
            <Tab label="Em alta" value="trending" />
          </Tabs>
          <UserPostList
            key={tab}
            endpoint={`/api/hashtags/${encodeURIComponent(hashtagKey)}/posts`}
            params={{ tab }}
            emptyText={tab === "trending" ? "Nada em alta nesta hashtag nas últimas 72 horas." : "Nenhuma publicação por enquanto."}
          />
        </Box>

        <Box component="aside" aria-label="Encontre outra conversa" sx={{ width: { xs: "100%", md: 280 }, flexShrink: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Encontre outra conversa
          </Typography>
          {KIND_ORDER.filter((k) => related[k]?.length).map((k) => (
            <Box key={k} sx={{ mb: 1.5 }}>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                {KIND_LABEL[k]}
              </Typography>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                {related[k].map((h) => (
                  <Chip
                    key={h.key}
                    size="small"
                    variant="outlined"
                    component={NextLink}
                    href={`/hashtag/${encodeURIComponent(h.key)}`}
                    clickable
                    label={`#${h.display}`}
                  />
                ))}
              </Stack>
            </Box>
          ))}
          <MuiLink component={NextLink} href="/" underline="hover" variant="caption">
            ← Comunidade
          </MuiLink>
        </Box>
      </Stack>
    </Box>
  );
}
