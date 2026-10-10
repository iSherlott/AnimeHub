"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import NewspaperOutlinedIcon from "@mui/icons-material/NewspaperOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { Box, Button, InputBase, Tab, Tabs, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { EmptyState, ErrorNotice } from "@/components/StatePanels";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { loginHref } from "@/lib/safeRedirect";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { useTimeZone } from "@/lib/useTimeZone";
import type { NewsItemDTO, NewsScope } from "@/lib/newsFeed";

type Result = { items: NewsItemDTO[]; nextBefore: string | null };

function NewsCard({ item }: { item: NewsItemDTO }) {
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  const animeTitle = item.anime ? resolveTitleText(preference, { ...item.anime, titlePortuguese: null }) : null;
  const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(item.publishedAt));
  const image = item.imageUrl ?? item.anime?.coverImage ?? null;

  return (
    <Box
      component="li"
      data-testid="news-item"
      sx={{ listStyle: "none", display: "grid", gridTemplateColumns: { xs: "72px minmax(0, 1fr)", md: "120px minmax(0, 1fr)" }, columnGap: { xs: 2, md: 3 }, p: { xs: 2, md: 2.5 }, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}
    >
      <Box aria-hidden sx={{ position: "relative", width: "100%", aspectRatio: "3 / 4", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820" }}>
        {image && <CoverImage src={image} sizes="120px" />}
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
        {animeTitle && (
          <Typography data-testid="news-anime" sx={{ fontSize: 12, fontWeight: 700, color: "primary.main", textTransform: "uppercase", overflowWrap: "anywhere" }}>
            {animeTitle}
          </Typography>
        )}
        <Typography component="h3" lang="en" sx={{ fontSize: { xs: 16, md: 18 }, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          <AppLink href={item.url} target="_blank" rel="noopener noreferrer" underline="hover" color="inherit">
            {item.title}
          </AppLink>
        </Typography>
        {item.excerpt && (
          <Typography lang="en" sx={{ fontSize: 14, lineHeight: 1.6, color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.excerpt}
          </Typography>
        )}
        <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
          {item.source}
          {item.author ? ` · ${item.author}` : ""} · {when}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Notícias da Comunidade: o que saiu sobre as obras da temporada atual,
 * organizado por "Que sigo" (obras da Minha Lista), "Todas" e busca (título da
 * notícia ou da obra). A matéria abre no site de origem, em outra aba.
 */
export function NewsView() {
  const user = useCurrentUser();
  const [scope, setScope] = useState<NewsScope>("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const inputId = useId();

  const load = useCallback(async (targetScope: NewsScope, q: string, before: string | null) => {
    const params = new URLSearchParams({ scope: targetScope });
    if (q) params.set("q", q);
    if (before) params.set("before", before);
    const res = await fetch(`/api/news?${params.toString()}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Result;
  }, []);

  const reload = useCallback(
    (targetScope: NewsScope, q: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      load(targetScope, q, null)
        .then((data) => {
          if (id === requestId.current) setResult(data);
        })
        .catch(() => {
          if (id === requestId.current) {
            setResult(null);
            setFailed(true);
          }
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    },
    [load]
  );

  const needsLogin = scope === "following" && user === null;
  useEffect(() => {
    // "Que sigo" não existe sem conta: nada a buscar até entrar.
    if (needsLogin || (scope === "following" && user === undefined)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(scope, applied);
  }, [scope, applied, needsLogin, user, reload]);

  async function more() {
    if (!result?.nextBefore) return;
    setLoadingMore(true);
    try {
      const next = await load(scope, applied, result.nextBefore);
      setResult((prev) => (prev ? { items: [...prev.items, ...next.items], nextBefore: next.nextBefore } : next));
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setApplied(query.trim());
  }

  const items = result?.items ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box component="form" onSubmit={submit} role="search" aria-label="Buscar notícias" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="label" htmlFor={inputId} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
          Busca nas notícias
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "10px", "&:focus-within": { borderColor: "text.secondary" } }}>
          <InputBase id={inputId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por obra ou assunto" fullWidth inputProps={{ maxLength: 80 }} sx={{ fontSize: 14, p: 0, "& input": { p: 0 } }} />
          <Button type="submit" aria-label="Buscar notícias" sx={{ minWidth: 32, p: 0.5, color: "text.primary" }}>
            <SearchIcon sx={{ fontSize: 18 }} />
          </Button>
        </Box>
      </Box>

      <Tabs value={scope} onChange={(_, v: NewsScope) => setScope(v)} aria-label="Escopo das notícias">
        <Tab label="Todas" value="all" data-testid="news-tab-all" />
        <Tab label="Que sigo" value="following" data-testid="news-tab-following" />
      </Tabs>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: -1 }}>
        {scope === "following" ? "Notícias das obras da sua Minha Lista, da mais nova para a mais antiga." : "Notícias das obras da temporada atual, da mais nova para a mais antiga."}
        {applied ? ` Filtrando por “${applied}”.` : ""}
      </Typography>

      {needsLogin ? (
        <EmptyState testId="news-login" icon={<NewspaperOutlinedIcon />} title="Entre para ver as notícias do que você acompanha." action={<Button href={loginHref("/noticias")} sx={ELEVATED_BUTTON_SX}>Entrar</Button>}>
          As notícias de “Que sigo” vêm das obras da sua Minha Lista.
        </EmptyState>
      ) : failed && items.length === 0 ? (
        <ErrorNotice testId="news-error" title="Não foi possível carregar as notícias." onRetry={() => reload(scope, applied)}>
          Sua busca e o escopo foram mantidos.
        </ErrorNotice>
      ) : loading ? (
        <Typography role="status" sx={{ fontSize: 14, color: "text.secondary" }}>
          Carregando notícias…
        </Typography>
      ) : items.length === 0 ? (
        <EmptyState testId="news-empty" icon={<ArticleOutlinedIcon />} title={applied ? "Nenhuma notícia encontrada." : scope === "following" ? "Nenhuma notícia das obras que você segue." : "Ainda não há notícias."}>
          {applied ? "Tente outro nome de obra ou assunto." : scope === "following" ? "Acompanhe obras da temporada para ver o que sai sobre elas." : "As notícias aparecem aqui depois da próxima busca."}
        </EmptyState>
      ) : (
        <>
          <Box component="ul" data-testid="news-list" sx={{ m: 0, p: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </Box>
          {result?.nextBefore && (
            <Box>
              <Button onClick={() => void more()} disabled={loadingMore} sx={ELEVATED_BUTTON_SX} data-testid="news-more">
                {loadingMore ? "Carregando…" : "Ver mais notícias"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
