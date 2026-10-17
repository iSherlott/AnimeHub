"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { SmallChip } from "@/components/admin/AdminUi";
import { SearchField } from "@/components/FilterField";
import { EmptyState, ErrorNotice, Notice } from "@/components/StatePanels";
import type { AnidbOnlyPage, AnidbOnlyRow, SearchHit } from "@/lib/anidbCandidates";

const rowSx = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: 1.5, py: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", minWidth: 0 } as const;

function Cover({ src }: { src: string | null }) {
  return (
    <Box
      aria-hidden
      sx={{ width: 40, height: 56, flexShrink: 0, borderRadius: "6px", overflow: "hidden", bgcolor: "#171820", ...(src ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}
    />
  );
}

/** Escolha de outra obra pela busca na AniList (uma linha). */
function SearchBox({ row, busy, onPick }: { row: AnidbOnlyRow; busy: boolean; onPick: (anilistId: number) => void }) {
  const [query, setQuery] = useState(row.title);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/anidb-candidates/search?q=${encodeURIComponent(query)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Não foi possível buscar agora.");
      else setHits(data.works ?? []);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Box data-testid={`anidb-search-box-${row.anidbId}`} sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
        <SearchField label="Buscar na AniList" value={query} onChange={setQuery} placeholder="Título da obra…" />
        <Button onClick={() => void search()} disabled={searching || query.trim().length < 2} sx={ELEVATED_BUTTON_SX} data-testid={`anidb-search-go-${row.anidbId}`}>
          {searching ? "Buscando…" : "Buscar"}
        </Button>
      </Box>
      {error && <Typography role="alert" sx={{ fontSize: 13, color: "primary.main" }}>{error}</Typography>}
      {hits && hits.length === 0 && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nada encontrado na AniList para essa busca.</Typography>}
      {hits && hits.length > 0 && (
        <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 0.75, p: 0, m: 0, listStyle: "none" }}>
          {hits.map((h) => (
            <Box component="li" key={h.anilistId} sx={{ ...rowSx, flexWrap: "nowrap" }}>
              <Cover src={h.coverImage} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{h.title}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[h.titleEnglish && h.titleEnglish !== h.title ? h.titleEnglish : null, h.seasonLabel, `AniList #${h.anilistId}`].filter(Boolean).join(" · ")}</Typography>
              </Box>
              <Button variant="contained" size="small" disabled={busy} onClick={() => onPick(h.anilistId)} data-testid={`anidb-hit-${h.anilistId}`}>
                Usar esta
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * Admin → Match name → "Obras sem página": obras que só existem pelo AniDB (sem página, sem horário, sem como acompanhar).
 * Com sugestão da AniList: confirmar ("É a mesma obra") ou recusar ("Não é"). Em qualquer uma, "Buscar outra" escolhe a obra
 * certa pela busca na AniList. Ligar traz página, capa, sinopse e episódios; nada acontece sem a decisão do admin.
 */
export function AnidbOnlyPanel() {
  const [tab, setTab] = useState<"suggested" | "none">("suggested");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AnidbOnlyPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searching, setSearching] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/anidb-candidates?tab=${tab}&page=${page}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Não foi possível carregar a lista.");
        return;
      }
      setData(body as AnidbOnlyPage);
    } catch {
      setError("Não foi possível falar com o servidor.");
    }
  }, [tab, page]);

  useEffect(() => {
    // A lista vem do servidor a cada troca de aba ou página.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(row: AnidbOnlyRow, action: "confirm" | "reject", anilistId?: number) {
    setBusy(`${action}-${row.anidbId}`);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/anidb-candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anidbId: row.anidbId, action, ...(anilistId ? { anilistId } : {}) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Não foi possível salvar a decisão.");
        return;
      }
      setDone(action === "confirm" ? `${row.title} agora é a obra da AniList e tem página.` : `Sugestão recusada para ${row.title}.`);
      setSearching(null);
      await load();
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(null);
    }
  }

  const counts = data?.counts;

  return (
    <Box component="section" aria-labelledby="mn-noscreen" data-testid="anidb-only" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="mn-noscreen" component="h2" sx={{ fontSize: 20 }}>
        Obras sem página
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Obras que só existem pelo AniDB: aparecem nas listas, mas não abrem página nem podem ser acompanhadas. Ligue cada uma à obra certa da AniList.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); setData(null); setSearching(null); }} aria-label="Obras sem página">
        <Tab value="suggested" label={`Com sugestão${counts ? ` · ${counts.suggested}` : ""}`} data-testid="tab-suggested" />
        <Tab value="none" label={`Sem sugestão${counts ? ` · ${counts.none}` : ""}`} data-testid="tab-none" />
      </Tabs>

      {error && <ErrorNotice title="Algo não deu certo" testId="anidb-error">{error}</ErrorNotice>}
      {done && (
        <Notice tone="success" title="Decisão salva" testId="anidb-done">
          {done}
        </Notice>
      )}

      {!data ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Carregando…</Typography>
      ) : data.rows.length === 0 ? (
        <EmptyState testId="anidb-empty" title={tab === "suggested" ? "Nenhuma sugestão pendente." : "Nenhuma obra sem sugestão."}>
          {tab === "suggested" ? "As sugestões do religamento já foram decididas." : "Toda obra do AniDB já tem uma obra da AniList ligada ou uma sugestão para decidir."}
        </EmptyState>
      ) : (
        <>
          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0, m: 0, listStyle: "none" }}>
            {data.rows.map((row) => (
              <Box component="li" key={row.anidbId} data-testid={`anidb-row-${row.anidbId}`} sx={rowSx}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, flex: "1 1 240px" }}>
                  <Cover src={row.coverImage} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>AniDB</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{row.title}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[row.seasonLabel, row.episodes ? `${row.episodes} ep.` : null, `AniDB #${row.anidbId}`].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                </Box>
                {row.candidate && (
                  <Box sx={{ minWidth: 0, flex: "1 1 240px" }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>Sugestão da AniList</Typography>
                    <Typography sx={{ fontSize: 14, overflowWrap: "anywhere" }}>
                      <a href={`https://anilist.co/anime/${row.candidate.anilistId}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                        {row.candidate.title}
                      </a>
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mt: 0.5 }}>
                      <SmallChip tone={row.candidate.score >= 0.85 ? "success" : "neutral"}>{Math.round(row.candidate.score * 100)}%</SmallChip>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{row.candidate.reason}</Typography>
                    </Box>
                  </Box>
                )}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {row.candidate && (
                    <>
                      <Button variant="contained" size="small" disabled={busy !== null} onClick={() => void decide(row, "confirm")} data-testid={`anidb-confirm-${row.anidbId}`}>
                        {busy === `confirm-${row.anidbId}` ? "Ligando…" : "É a mesma obra"}
                      </Button>
                      <Button size="small" disabled={busy !== null} onClick={() => void decide(row, "reject")} sx={ELEVATED_BUTTON_SX} data-testid={`anidb-reject-${row.anidbId}`}>
                        Não é
                      </Button>
                    </>
                  )}
                  <Button size="small" disabled={busy !== null} onClick={() => setSearching(searching === row.anidbId ? null : row.anidbId)} sx={ELEVATED_BUTTON_SX} data-testid={`anidb-search-${row.anidbId}`}>
                    {row.candidate ? "Buscar outra" : "Buscar na AniList"}
                  </Button>
                </Box>
                {searching === row.anidbId && <SearchBox row={row} busy={busy !== null} onPick={(anilistId) => void decide(row, "confirm", anilistId)} />}
              </Box>
            ))}
          </Box>
          {data.pages > 1 && (
            <Box component="nav" aria-label="Paginação" sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={data.page === 0} sx={ELEVATED_BUTTON_SX} data-testid="anidb-prev">
                Anterior
              </Button>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Página {data.page + 1} de {data.pages} · {data.total} obras
              </Typography>
              <Button onClick={() => setPage((p) => Math.min(data.pages - 1, p + 1))} disabled={data.page >= data.pages - 1} sx={ELEVATED_BUTTON_SX} data-testid="anidb-next">
                Próxima
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
