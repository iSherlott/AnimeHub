"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Tab, Tabs, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { HashtagRow } from "@/components/HashtagRow";
import { TwoColumn } from "@/components/PageShell";
import { UserPostList } from "@/components/UserPostList";

type Tag = { key: string; display: string };
type Related = Record<string, Tag[]>;
type Work = {
  anilistId: number;
  titleNative: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  format: string | null;
  seasonNumber: number;
  seasonYear: number | null;
};

const GROUPS: Array<{ kind: string; label: string }> = [
  { kind: "WORK", label: "OBRAS" },
  { kind: "SEASON", label: "TEMPORADA" },
  { kind: "GENRE", label: "GÊNEROS" },
  { kind: "TOPIC", label: "TÓPICOS" },
];

/**
 * Página de hashtag (Figma `13:42068`): busca preenchida, contagem, abas
 * "Recentes" (cronológico) e "Em alta" (atividade recente NESTA tag — critério/
 * janela pendentes, proposta 72 h), lateral "Encontre outra conversa" por tipo
 * e "Obra em contexto" quando a tag é de uma obra. A hashtag não associa
 * nenhuma obra por si só.
 */
export function HashtagView({ hashtagKey, display }: { hashtagKey: string; display: string }) {
  const [tab, setTab] = useState<"recent" | "trending">("recent");
  const [count, setCount] = useState<number | null>(null);
  const [related, setRelated] = useState<Related>({});
  const [work, setWork] = useState<Work | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hashtags/${encodeURIComponent(hashtagKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) return setCount(0);
        setCount(data.hashtag.postCount);
        setRelated(data.related ?? {});
        setWork(data.work ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hashtagKey]);

  const main = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <CommunitySearchBox initialQuery={`#${display}`} scope="posts" />
      <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="hashtag-count">
        {count === null ? "" : `${count} ${count === 1 ? "publicação" : "publicações"}`}
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Ordem das publicações">
        <Tab label="Recentes" value="recent" />
        <Tab label="Em alta" value="trending" />
      </Tabs>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Recentes: ordem cronológica. Em alta: descoberta por atividade recente nesta hashtag; critérios e janela de tempo ainda
        em definição.
      </Typography>

      <UserPostList
        key={tab}
        endpoint={`/api/hashtags/${encodeURIComponent(hashtagKey)}/posts`}
        params={{ tab }}
        timeStyle="clock"
        emptyText={tab === "trending" ? "Nada em alta nesta hashtag nas últimas 72 horas." : "Nenhuma publicação por enquanto."}
      />

      <Typography sx={{ fontSize: 14, color: "text.secondary", pt: 2 }}>
        Normalização: #{hashtagKey} e #{display} resolvem para um único ID canônico. O nome de exibição é preservado; não há páginas duplicadas por caixa.
      </Typography>
    </Box>
  );

  const aside = (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
          Encontre outra conversa
        </Typography>
        {GROUPS.filter((g) => related[g.kind]?.length).map((g) => (
          <Stack key={g.kind} spacing={1}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>{g.label}</Typography>
            <HashtagRow tags={related[g.kind]} />
          </Stack>
        ))}
      </Box>

      {work && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
            Obra em contexto
          </Typography>
          <Typography lang={work.titleNative ? "ja" : undefined} sx={{ fontSize: 20, fontWeight: 700 }}>
            {work.titleNative ?? work.titleRomaji}
          </Typography>
          {work.titleEnglish && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{work.titleEnglish}</Typography>}
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Season {work.seasonNumber}
            {work.format ? ` · ${work.format}` : ""}
            {work.seasonYear ? ` · ${work.seasonYear}` : ""}
          </Typography>
          <AppLink href={`/anime/${work.anilistId}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Abrir detalhe do anime ↗
          </AppLink>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Esta associação vem do catálogo de produções, não de uma hashtag ambígua.
          </Typography>
        </Box>
      )}
    </>
  );

  return <TwoColumn main={main} aside={aside} />;
}
