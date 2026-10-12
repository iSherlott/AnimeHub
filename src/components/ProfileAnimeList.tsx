"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Box, ButtonBase, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { SearchField } from "@/components/FilterField";
import type { GenreFacet, ProfileAnimeEntry } from "@/lib/profileAnimeList";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

type Loaded = { total: number; entries: ProfileAnimeEntry[]; genres: GenreFacet[]; isOwn: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "hidden" } | ({ kind: "ok" } & Loaded);

const STATUS_LABELS: Record<string, string> = {
  RELEASING: "Em exibição",
  NOT_YET_RELEASED: "Em breve",
  FINISHED: "Finalizado",
  HIATUS: "Em hiato",
  CANCELLED: "Cancelado",
};

function Chip({ selected, onClick, children, testId }: { selected: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: "999px",
        fontSize: 13,
        fontWeight: 700,
        bgcolor: selected ? "primary.main" : "#171820",
        color: selected ? "primary.contrastText" : "text.primary",
        border: 1,
        borderColor: selected ? "primary.main" : "divider",
        "&:hover": { bgcolor: selected ? "primary.main" : "#1d1e28" },
        "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

function AnimeTile({ entry }: { entry: ProfileAnimeEntry }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, entry) || entry.titleRomaji;
  return (
    <Box component="li" sx={{ listStyle: "none", minWidth: 0 }} data-testid={`profile-anime-${entry.anilistId}`}>
      <Box component={NextLink} href={`/obra/${entry.anilistId}`} sx={{ display: "flex", flexDirection: "column", gap: 1, color: "text.primary", textDecoration: "none", "&:hover .title": { textDecoration: "underline" } }}>
        <Box sx={{ position: "relative", aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820" }}>
          {entry.coverImage && <CoverImage src={entry.coverImage} sizes="(max-width: 600px) 40vw, 160px" />}
        </Box>
        <Typography className="title" lang={preference.language === "ja" && entry.titleNative === title ? "ja" : undefined} sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
          {title}
        </Typography>
        {entry.status && STATUS_LABELS[entry.status] && (
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{STATUS_LABELS[entry.status]}</Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * Aba "Animes" do perfil (estilo My Anime List): capas das obras acompanhadas, busca por título e filtro por gênero.
 * Busca no servidor (`/api/users/[id]/animes`), então vale para o próprio perfil e para o de outras pessoas
 * respeitando a privacidade que a pessoa escolheu.
 */
export function ProfileAnimeList({ userId, isOwnProfile }: { userId: string; isOwnProfile: boolean }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [state, setState] = useState<State>({ kind: "loading" });
  // Chips de gênero vêm da lista inteira e não mudam enquanto se filtra.
  const [facets, setFacets] = useState<GenreFacet[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (genre) params.set("genre", genre);
        fetch(`/api/users/${userId}/animes?${params.toString()}`)
          .then(async (res) => {
            if (res.status === 403) return { kind: "hidden" } as State;
            if (!res.ok) return { kind: "error" } as State;
            const data = (await res.json()) as Loaded;
            return { kind: "ok", ...data } as State;
          })
          .catch(() => ({ kind: "error" }) as State)
          .then((next) => {
            if (cancelled) return;
            setState(next);
            if (next.kind === "ok" && !genre && !query.trim()) setFacets(next.genres);
          });
      },
      query ? 250 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, query, genre]);

  if (state.kind === "hidden") {
    return (
      <Typography data-testid="profile-anime-hidden" sx={{ color: "text.secondary" }}>
        Esta pessoa mantém a lista de animes privada.
      </Typography>
    );
  }
  if (state.kind === "error") {
    return (
      <Typography role="alert" sx={{ color: "text.secondary" }}>
        Não foi possível carregar os animes. Tente novamente.
      </Typography>
    );
  }
  const filtering = Boolean(query.trim() || genre);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }} data-testid="profile-anime-list">
      {state.kind === "ok" && state.total === 0 && !filtering ? (
        <Typography sx={{ color: "text.secondary" }}>
          {isOwnProfile ? "Você ainda não acompanha nenhum anime. Acompanhe uma obra para ela aparecer aqui." : "Esta pessoa ainda não acompanha nenhum anime."}
        </Typography>
      ) : (
        <>
          <SearchField label="Buscar animes" value={query} onChange={setQuery} placeholder="Buscar anime..." />
          {facets.length > 0 && (
            <Box role="group" aria-label="Filtrar por gênero" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip selected={genre === ""} onClick={() => setGenre("")} testId="genre-all">
                Todos
              </Chip>
              {facets.map((f) => (
                <Chip key={f.genre} selected={genre === f.genre} onClick={() => setGenre(genre === f.genre ? "" : f.genre)} testId={`genre-${f.genre}`}>
                  {f.genre} · {f.count}
                </Chip>
              ))}
            </Box>
          )}
          {state.kind === "loading" ? (
            <Typography role="status" sx={{ color: "text.secondary" }}>
              Carregando…
            </Typography>
          ) : state.entries.length === 0 ? (
            <Typography data-testid="profile-anime-empty" sx={{ color: "text.secondary" }}>
              Nenhum anime bate com essa busca.
            </Typography>
          ) : (
            <>
              <Typography data-testid="profile-anime-count" sx={{ fontSize: 13, color: "text.secondary" }}>
                {filtering ? `${state.entries.length} de ${state.total}` : state.total} {state.total === 1 ? "anime" : "animes"}
              </Typography>
              <Box component="ul" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 2, p: 0, m: 0 }}>
                {state.entries.map((entry) => (
                  <AnimeTile key={entry.anilistId} entry={entry} />
                ))}
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
