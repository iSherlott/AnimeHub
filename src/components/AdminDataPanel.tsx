"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import {
  Alert,
  Box,
  Button,
  Chip,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

type Summary = {
  source: string;
  lastStatus: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
};
type Run = {
  id: string;
  source: string;
  status: "OK" | "PARTIAL" | "ERROR";
  startedAt: string;
  durationMs: number;
  itemsProcessed: number;
  itemsFailed: number;
  message: string | null;
};
type Production = {
  anilistId: number;
  titleRomaji: string;
  titleNative: string | null;
  format: string | null;
  seasonNumber: number;
  status: string | null;
  followers: number;
};
type Franchise = { id: string; name: string; rootAnilistId: number; productions: Production[] };

const STATUS_LABEL: Record<Run["status"], string> = { OK: "OK", PARTIAL: "Parcial", ERROR: "Erro" };
const STATUS_COLOR: Record<Run["status"], "success" | "warning" | "error"> = {
  OK: "success",
  PARTIAL: "warning",
  ERROR: "error",
};

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "nunca";
}

/**
 * Admin → Dados (ADMIN-003/004/006): Execuções (jobs/logs dos serviços de
 * ingestão) e Catálogo Franquia → Produção. Somente leitura nesta versão;
 * importação por HTML, matching, conflitos, overrides e scrapers dependem de
 * decisões abertas (D-17, D-30).
 */
export function AdminDataPanel() {
  const [summary, setSummary] = useState<Summary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsFailed, setRunsFailed] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [catalog, setCatalog] = useState<{ total: number; pageSize: number; franchises: Franchise[] } | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ingestion-runs")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falha"))))
      .then((data) => {
        if (cancelled) return;
        setSummary(data.summary ?? []);
        setRuns(data.runs ?? []);
      })
      .catch(() => {
        if (!cancelled) setRunsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/catalog?${new URLSearchParams({ q: query, page: String(page) }).toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falha"))))
      .then((data) => {
        if (cancelled) return;
        setCatalogFailed(false);
        setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setCatalogFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  const totalPages = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.pageSize)) : 1;

  return (
    <Box component="section" data-testid="admin-data">
      <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
        Dados e execuções
      </Typography>

      {runsFailed && <Alert severity="error" sx={{ mb: 2 }}>Não foi possível carregar as execuções.</Alert>}
      {summary.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, mb: 2 }}>
          {summary.map((s) => (
            <Paper key={s.source} variant="outlined" sx={{ p: 1.5, minWidth: 220 }} data-testid={`job-${s.source}`}>
              <Typography variant="subtitle2">{s.source}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", my: 0.5 }}>
                {s.lastStatus && (
                  <Chip
                    size="small"
                    color={STATUS_COLOR[s.lastStatus as Run["status"]] ?? "default"}
                    label={STATUS_LABEL[s.lastStatus as Run["status"]] ?? s.lastStatus}
                  />
                )}
                {s.stale && <Chip size="small" color="warning" variant="outlined" label="Atrasado" />}
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Último sucesso: {fmt(s.lastSuccessAt)}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
        <Table size="small" aria-label="Execuções recentes">
          <TableHead>
            <TableRow>
              <TableCell>Fonte</TableCell>
              <TableCell>Início</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right">Itens</TableCell>
              <TableCell align="right">Falhas</TableCell>
              <TableCell>Mensagem</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>Nenhuma execução registrada ainda.</TableCell>
              </TableRow>
            ) : (
              runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.source}</TableCell>
                  <TableCell>{fmt(r.startedAt)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[r.status]} label={STATUS_LABEL[r.status]} />
                  </TableCell>
                  <TableCell align="right">{r.itemsProcessed}</TableCell>
                  <TableCell align="right">{r.itemsFailed}</TableCell>
                  <TableCell>{r.message ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
        Catálogo (Franquia → Produção)
      </Typography>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery(q.trim());
        }}
        style={{ marginBottom: 12 }}
      >
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label="Buscar no catálogo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <Button type="submit" variant="outlined">
            Buscar
          </Button>
        </Stack>
      </form>
      {catalogFailed && <Alert severity="error" sx={{ mb: 2 }}>Não foi possível carregar o catálogo.</Alert>}
      {catalog && catalog.franchises.length === 0 && !catalogFailed && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nenhuma franquia encontrada.
        </Typography>
      )}
      <Stack spacing={1.5} data-testid="catalog">
        {catalog?.franchises.map((f) => (
          <Paper key={f.id} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2">
              {f.name} <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>(raiz AniList {f.rootAnilistId})</Typography>
            </Typography>
            <Stack component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.5 }} spacing={0.25}>
              {f.productions.map((p) => (
                <li key={p.anilistId}>
                  <Typography variant="body2">
                    T{p.seasonNumber} ·{" "}
                    <MuiLink component={NextLink} href={`/obra/${p.anilistId}`} underline="hover">
                      {p.titleRomaji}
                    </MuiLink>
                    {p.titleNative ? ` · ${p.titleNative}` : ""} · {p.format ?? "—"} · {p.followers}{" "}
                    {p.followers === 1 ? "seguidor" : "seguidores"}
                  </Typography>
                </li>
              ))}
            </Stack>
          </Paper>
        ))}
      </Stack>
      {catalog && totalPages > 1 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
          <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Typography variant="caption">
            Página {page + 1} de {totalPages}
          </Typography>
          <Button size="small" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </Stack>
      )}
    </Box>
  );
}
