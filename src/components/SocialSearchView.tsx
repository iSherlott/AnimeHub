"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip, Link as MuiLink, Stack, Tab, Tabs, Typography } from "@mui/material";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { UserPostList } from "@/components/UserPostList";
import { UserAvatar } from "@/components/UserAvatar";

export type SearchScope = "posts" | "profiles" | "hashtags";

type Profile = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; bio: string | null };
type Tag = { key: string; display: string; kind: string; postCount: number };
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; profiles: Profile[]; hashtags: Tag[] };

const SCOPES: Array<{ value: SearchScope; label: string }> = [
  { value: "posts", label: "Publicações" },
  { value: "profiles", label: "Perfis" },
  { value: "hashtags", label: "Hashtags" },
];

/**
 * Busca social (SOC-004/005, Figma `13:43738`). Consulta e escopo vivem na
 * URL: trocar de escopo troca a URL (replace), então voltar do navegador
 * depois de abrir um resultado devolve a mesma busca. Erro de rede é
 * distinto de "sem resultados".
 */
export function SocialSearchView({ query, scope }: { query: string; scope: SearchScope }) {
  const router = useRouter();
  const tooShort = [...query.trim()].length < 2;
  const [state, setState] = useState<State>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (tooShort || scope === "posts") return;
    let cancelled = false;
    const params = new URLSearchParams({ q: query, scope });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    fetch(`/api/search?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("falha");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          status: "ok",
          profiles: data.profiles ?? [],
          hashtags: data.hashtags ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [query, scope, tooShort, attempt]);

  function changeScope(next: SearchScope) {
    router.replace(`/buscar?${new URLSearchParams({ q: query, scope: next }).toString()}`);
  }

  const total = state.status === "ok" ? (scope === "profiles" ? state.profiles.length : state.hashtags.length) : 0;

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
            emptyText={`Nenhum resultado para “${query}” em publicações. Tente outro termo ou outro escopo.`}
          />
        </Box>
      ) : state.status === "loading" || state.status === "idle" ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Buscando…
        </Typography>
      ) : state.status === "error" ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível buscar agora. Isso não quer dizer que não há resultados.
        </Alert>
      ) : total === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="search-empty">
          Nenhum resultado para “{query}” em {SCOPES.find((s) => s.value === scope)?.label.toLowerCase()}. Tente outro termo ou
          outro escopo.
        </Typography>
      ) : scope === "profiles" ? (
        <Stack spacing={1.5} data-testid="search-results">
          {state.profiles.map((p) => (
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
      ) : (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }} data-testid="search-results">
          {state.hashtags.map((t) => (
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
      )}
    </Box>
  );
}
