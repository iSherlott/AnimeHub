"use client";

import { useEffect, useState } from "react";
import { Box, Button, Chip, Select, Stack, TextField, Typography } from "@mui/material";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
import { adminPanelSx } from "./AdminUi";

type Item = { id: string; anilistId: number | null; anidbId: number | null; title: string; kind: string | null; genres: string[]; siteScore: number; curated: boolean; issues: string[] };
type Page = { total: number; page: number; pageSize: number; items: Item[] };

const SHORT: Record<string, string> = {
  TITLE_EN_MISSING: "sem título EN",
  TITLE_JA_MISSING: "sem título JA",
  SYNOPSIS_EN_MISSING: "sem sinopse",
  NO_GENRE: "sem gênero",
  OFFICIAL_SITE_MISSING: "sem site",
  KIND_UNKNOWN: "sem tipo",
  ANILIST_NOT_FOUND: "fora da AniList",
  ADULT_REMOVED: "adulto",
};

const FILTERS: Array<[string, string]> = [
  ["all", "Todas as obras"],
  ["curated", "Já curadas"],
  ["todo", "Faltam curar"],
  ["issues", "Com pendência"],
];

/**
 * A lista de TODAS as obras da plataforma com o estado de cada uma (curada ou não, tipo, gêneros, nota do site e pendências).
 * Atualiza sozinha enquanto a curadoria roda, para ver as obras sendo corrigidas uma a uma.
 */
export function CurationEntries({ running }: { running: boolean }) {
  const [filter, setFilter] = useState("all");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/curation/entries?filter=${filter}&page=${page}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as Page;
        if (cancelled) return;
        setData(next);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void load();
    if (!running) return () => { cancelled = true; };
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [filter, page, q, running]);

  const last = data ? Math.max(0, Math.ceil(data.total / data.pageSize) - 1) : 0;
  return (
    <Box component="section" sx={adminPanelSx} data-testid="curation-entries">
      <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <Typography component="h2" sx={{ fontSize: 20 }}>
          Todas as obras {data ? <span style={{ opacity: 0.6, fontSize: 14 }} data-testid="curation-entries-total">· {data.total.toLocaleString("pt-BR")}</span> : null}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Select native size="small" value={filter} onChange={(e) => { setFilter(String(e.target.value)); setPage(0); }} inputProps={{ "aria-label": "Filtrar obras", "data-testid": "curation-entries-filter" }} sx={{ minWidth: 170 }}>
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(input.trim());
              setPage(0);
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <TextField size="small" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Buscar pelo título" slotProps={{ htmlInput: { "aria-label": "Buscar obra", "data-testid": "curation-entries-search" } }} />
            <Button type="submit" variant="outlined" size="small">
              Buscar
            </Button>
          </form>
        </Stack>
      </Box>

      {error && <Typography sx={{ fontSize: 13, color: "warning.main" }}>Não consegui carregar a lista agora.</Typography>}
      <Box sx={{ overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 13, "& th, & td": { textAlign: "left", p: "8px 10px", borderBottom: 1, borderColor: "divider", verticalAlign: "top" }, "& th": { fontSize: 11, textTransform: "uppercase", color: "text.secondary" } }}>
          <thead>
            <tr>
              <th>Obra</th>
              <th>Tipo</th>
              <th>Gêneros</th>
              <th>Nota</th>
              <th>Situação</th>
              <th>Pendências</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((item) => (
              <tr key={item.id} data-testid={`curation-row-${item.id}`}>
                <td>
                  {item.title}
                  <div style={{ opacity: 0.55, fontSize: 11 }}>{item.anilistId ? `AniList ${item.anilistId}` : item.anidbId ? `AniDB ${item.anidbId}` : ""}</div>
                </td>
                <td>{item.kind ? KIND_LABELS[item.kind as Kind] ?? item.kind : "—"}</td>
                <td>{item.genres.length ? item.genres.join(", ") : "—"}</td>
                <td>{item.siteScore.toFixed(1)}</td>
                <td>
                  <Chip size="small" color={item.curated ? "success" : "default"} variant={item.curated ? "filled" : "outlined"} label={item.curated ? "Curada" : "Falta"} data-testid={`curation-row-state-${item.id}`} />
                </td>
                <td>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {item.issues.length === 0 ? <span style={{ opacity: 0.5 }}>—</span> : item.issues.map((code) => <Chip key={code} size="small" color="warning" variant="outlined" label={SHORT[code] ?? code} />)}
                  </Stack>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} data-testid="curation-entries-empty">
                  Nenhuma obra neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </Box>
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anteriores
        </Button>
        <Typography sx={{ fontSize: 12 }} data-testid="curation-entries-range">
          {data && data.total > 0 ? `${data.page * data.pageSize + 1}–${Math.min((data.page + 1) * data.pageSize, data.total)} de ${data.total.toLocaleString("pt-BR")}` : "0"}
        </Typography>
        <Button size="small" disabled={page >= last} onClick={() => setPage(page + 1)}>
          Próximas
        </Button>
      </Stack>
    </Box>
  );
}
