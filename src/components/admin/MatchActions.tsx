"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckIcon from "@mui/icons-material/Check";
import SearchIcon from "@mui/icons-material/Search";
import { Box, Button, InputBase, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ErrorNotice } from "@/components/StatePanels";

type Candidate = { id: string; anilistId: number; titleRomaji: string; titleNative: string | null; seasonNumber: number | null; format: string | null; franchise: string | null };

/**
 * Ações do "Revisar correspondência" (Figma `8:4179`): Confirmar associa a
 * origem à produção; Outro candidato permite buscar outra produção; Ignorar
 * exclui o registro do commit. Nada é aplicado ao catálogo aqui — só a prévia.
 */
export function MatchActions({
  recordId,
  hasCandidate,
  editable,
  nextHref,
}: {
  recordId: string;
  hasCandidate: boolean;
  /** `false` quando o job já foi concluído/cancelado. */
  editable: boolean;
  nextHref: string;
}) {
  const router = useRouter();
  const searchId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);

  useEffect(() => {
    if (!searching || q.trim().length < 2) {
      // Sem consulta suficiente, não há resultado a mostrar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/productions?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => setResults(d.results ?? []))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, searching]);

  async function act(body: Record<string, unknown>, then: "next" | "refresh") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/import-records/${recordId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a decisão. Tente novamente.");
        return;
      }
      if (then === "next") router.push(nextHref);
      else {
        setSearching(false);
        setQ("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editable) {
    return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Esta importação já foi concluída ou cancelada; as decisões não podem mais ser alteradas.</Typography>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button variant="contained" startIcon={<CheckIcon />} disabled={busy || !hasCandidate} onClick={() => void act({ action: "confirm" }, "next")} data-testid="match-confirm">
          Confirmar
        </Button>
        <Button startIcon={<SearchIcon />} disabled={busy} onClick={() => setSearching((v) => !v)} aria-expanded={searching} sx={ELEVATED_BUTTON_SX} data-testid="match-other">
          Outro candidato
        </Button>
        <Button startIcon={<BlockOutlinedIcon />} disabled={busy} onClick={() => void act({ action: "ignore" }, "next")} sx={ELEVATED_BUTTON_SX} data-testid="match-ignore">
          Ignorar
        </Button>
        <Button disabled={busy} onClick={() => void act({ action: "new" }, "next")} sx={ELEVATED_BUTTON_SX} data-testid="match-new">
          Criar como novo
        </Button>
      </Box>

      {searching && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2.5, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Typography component="label" htmlFor={searchId} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            Buscar produção no catálogo
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, borderRadius: "10px", border: 1, borderColor: "divider", "&:focus-within": { borderColor: "text.secondary" } }}>
            <InputBase id={searchId} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou AniList id…" fullWidth autoFocus sx={{ fontSize: 14 }} />
            <SearchIcon sx={{ fontSize: 18 }} />
          </Box>
          {results && results.length === 0 && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma produção encontrada para “{q.trim()}”.</Typography>}
          {results && results.length > 0 && (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
              {results.map((c) => (
                <Box key={c.id} component="li" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 14 }}>
                    <span lang={c.titleNative ? "ja" : undefined}>{c.titleNative ?? c.titleRomaji}</span> · {c.franchise ? `${c.franchise} · Season ${c.seasonNumber}` : "Catálogo da temporada"}
                    {c.format ? ` · ${c.format}` : ""} · AniList #{c.anilistId}
                  </Typography>
                  <Button size="small" disabled={busy} onClick={() => void act({ action: "candidate", productionId: c.id }, "refresh")} sx={ELEVATED_BUTTON_SX}>
                    Usar este candidato
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
      {error && <ErrorNotice title="Não foi possível salvar a decisão.">{error}</ErrorNotice>}
    </Box>
  );
}
