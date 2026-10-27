"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip, Link as MuiLink, Stack, Tab, Tabs, Typography } from "@mui/material";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { UserPostList } from "@/components/UserPostList";
import { UserAvatar } from "@/components/UserAvatar";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { usePagedList } from "@/lib/usePagedList";

export type SearchScope = "posts" | "profiles" | "hashtags";

type Profile = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; bio: string | null };
type Tag = { key: string; display: string; kind: string; postCount: number };

const SCOPES: Array<{ value: SearchScope; label: string }> = [
  { value: "posts", label: "Publicações" },
  { value: "profiles", label: "Perfis" },
  { value: "hashtags", label: "Hashtags" },
];

/**
 * Busca social (SOC-004/005, Figma `13:43738`). Consulta e escopo vivem na
 * URL: trocar de escopo troca a URL (replace), então voltar do navegador
 * depois de abrir um resultado devolve a mesma busca. Erro de rede é
 * distinto de "sem resultados". Publicações, perfis e hashtags chegam página
 * a página, conforme a pessoa desce (rolagem infinita).
 */
export function SocialSearchView({ query, scope }: { query: string; scope: SearchScope }) {
  const router = useRouter();
  const tooShort = [...query.trim()].length < 2;

  // Perfis e hashtags: 20 por página, a seguinte vem quando o fim da lista se aproxima.
  const fetchScoped = async <T,>(cursor: string | null, key: "profiles" | "hashtags") => {
    const params = new URLSearchParams({ q: query, scope: key });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error("falha");
    const data = await res.json();
    return { items: (data[key] ?? []) as T[], nextCursor: (data.nextCursor ?? null) as string | null };
  };
  const profiles = usePagedList<Profile>({ resetKey: `profiles|${query}`, enabled: !tooShort && scope === "profiles", keyOf: (p) => p.id, fetchPage: (cursor) => fetchScoped<Profile>(cursor, "profiles") });
  const hashtags = usePagedList<Tag>({ resetKey: `hashtags|${query}`, enabled: !tooShort && scope === "hashtags", keyOf: (t) => t.key, fetchPage: (cursor) => fetchScoped<Tag>(cursor, "hashtags") });
  const active = scope === "profiles" ? profiles : hashtags;
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(active.loadMore, active.hasMore && !active.loading && !active.failed, active.items.length);

  function changeScope(next: SearchScope) {
    router.replace(`/buscar?${new URLSearchParams({ q: query, scope: next }).toString()}`);
  }

  const footer = (
    <InfiniteFooter
      testId="search"
      sentinelRef={sentinelRef}
      supported={infiniteSupported}
      hasMore={active.hasMore}
      loadingMore={active.loadingMore}
      failed={active.failed}
      onMore={active.loadMore}
      onRetry={active.retry}
      loadingLabel="Carregando mais resultados…"
      moreLabel="Ver mais resultados"
    />
  );

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mb: 2 }}>
        Buscar na comunidade
      </Typography>
      <CommunitySearchBox key={`${query}:${scope}`} initialQuery={query} scope={scope} />
      <Tabs value={scope} onChange={(_, v) => changeScope(v)} sx={{ my: 2 }} aria-label="Escopo da busca">
        {SCOPES.map((s) => (
          <Tab key={s.value} label={s.label} value={s.value} />
        ))}
      </Tabs>

      {tooShort ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="search-hint">
          Digite pelo menos 2 caracteres para buscar.
        </Typography>
      ) : scope === "posts" ? (
        <Box data-testid="search-results">
          <UserPostList
            key={`${query}`}
            endpoint="/api/search"
            params={{ q: query, scope: "posts" }}
            emptyText={`Nenhum resultado para “${query}” em publicações. Tente outro termo ou outra aba.`}
          />
        </Box>
      ) : active.loading ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Buscando…
        </Typography>
      ) : active.failed && active.items.length === 0 ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={active.retry}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível buscar agora. Isso não quer dizer que não há resultados.
        </Alert>
      ) : active.items.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="search-empty">
          Nenhum resultado para “{query}” em {SCOPES.find((s) => s.value === scope)?.label.toLowerCase()}. Tente outro termo ou
          outra aba.
        </Typography>
      ) : scope === "profiles" ? (
        <>
          <Stack spacing={1.5} data-testid="search-results">
            {profiles.items.map((p) => (
              <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <UserAvatar id={p.id} displayName={p.displayName} avatarUrl={p.avatarUrl} size={40} />
                <Box sx={{ minWidth: 0 }}>
                  <MuiLink component={NextLink} href={`/users/${p.id}`} underline="hover" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {p.displayName}
                  </MuiLink>
                  {p.handle && (
                    <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                      @{p.handle}
                    </Typography>
                  )}
                  {p.bio && (
                    <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }} noWrap>
                      {p.bio}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Stack>
          {footer}
        </>
      ) : (
        <>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }} data-testid="search-results">
            {hashtags.items.map((t) => (
              <Chip
                key={t.key}
                component={NextLink}
                href={`/hashtag/${encodeURIComponent(t.key)}`}
                clickable
                variant="outlined"
                label={`#${t.display} · ${t.postCount}`}
              />
            ))}
          </Stack>
          {footer}
        </>
      )}
    </Box>
  );
}
