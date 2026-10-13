"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { Box, Button, FormControlLabel, Radio, RadioGroup, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ErrorNotice, Notice } from "@/components/StatePanels";

export type BulkChoice = "confirm" | "new" | "ignore";

export type PendingRow = {
  id: string;
  title: string;
  native: string | null;
  sourceKey: string;
  /** Pontuação do melhor candidato (0–100); null quando não há candidato. */
  scorePct: number | null;
  candidate: { title: string; detail: string } | null;
  /** O que o sistema sugere: ligar ao candidato ou criar como obra nova. */
  suggested: BulkChoice;
};

const rowSx = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: 1.5, py: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", minWidth: 0 } as const;

/**
 * Revisão em lote das pendências da importação: todas numa tela só, cada uma com "Mesma obra / Obra nova / Ignorar", e um
 * único botão para aplicar. Começa com "Obra nova" (obra nova é obra nova), a não ser que o candidato seja bem provável.
 */
export function PendingBulkReview({ seq, rows }: { seq: number; rows: PendingRow[] }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, BulkChoice>>(() => Object.fromEntries(rows.map((r) => [r.id, r.suggested])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const count = (choice: BulkChoice) => rows.filter((r) => choices[r.id] === choice).length;

  async function apply() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/imports/${seq}/records`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: rows.map((r) => ({ id: r.id, action: choices[r.id] })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível aplicar as decisões. Tente novamente.");
        return;
      }
      setDone(`${data.applied} ${data.applied === 1 ? "decisão aplicada" : "decisões aplicadas"}${data.skipped ? ` · ${data.skipped} não puderam ser aplicadas` : ""}.`);
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0 && !done) return null;

  return (
    <Box component="section" aria-labelledby="bulk-title" data-testid="bulk-review" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="bulk-title" component="h2" sx={{ fontSize: 20 }}>
        Revisar as {rows.length} pendências de uma vez
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Para cada obra, diga se é a mesma do catálogo, se é uma obra nova ou se fica de fora. Nada é salvo no catálogo até você confirmar a importação.
      </Typography>

      {error && <ErrorNotice title="Algo não deu certo" testId="bulk-error">{error}</ErrorNotice>}
      {done && (
        <Notice tone="success" title="Decisões aplicadas" testId="bulk-done">
          {done}
        </Notice>
      )}

      {rows.length > 0 && (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
            <Button onClick={() => setChoices(Object.fromEntries(rows.map((r) => [r.id, "new" as BulkChoice])))} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="bulk-all-new">
              Todas como obra nova
            </Button>
            <Button onClick={() => setChoices(Object.fromEntries(rows.map((r) => [r.id, r.suggested])))} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="bulk-suggested">
              Voltar à sugestão
            </Button>
            <Typography data-testid="bulk-tally" sx={{ fontSize: 13, color: "text.secondary" }}>
              {count("new")} novas · {count("confirm")} mesma obra · {count("ignore")} ignoradas
            </Typography>
          </Box>

          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0, m: 0, listStyle: "none" }}>
            {rows.map((r) => (
              <Box component="li" key={r.id} data-testid={`bulk-row-${r.id}`} sx={rowSx}>
                <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{r.title}</Typography>
                  {r.native && (
                    <Typography lang="ja" sx={{ fontSize: 12, color: "text.secondary" }}>
                      {r.native}
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>AniDB #{r.sourceKey}</Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>Candidato no catálogo</Typography>
                  {r.candidate ? (
                    <>
                      <Typography sx={{ fontSize: 14, overflowWrap: "anywhere" }}>{r.candidate.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                        {r.candidate.detail}
                        {r.scorePct !== null ? ` · ${r.scorePct}% de semelhança` : ""}
                      </Typography>
                    </>
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sem candidato</Typography>
                  )}
                </Box>
                <RadioGroup
                  row
                  aria-label={`Decisão para ${r.title}`}
                  value={choices[r.id]}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [r.id]: e.target.value as BulkChoice }))}
                  sx={{ flexWrap: "nowrap" }}
                >
                  <FormControlLabel value="new" control={<Radio size="small" slotProps={{ input: { "data-testid": `bulk-choice-${r.id}-new` } as React.InputHTMLAttributes<HTMLInputElement> }} />} label="Obra nova" disabled={busy} />
                  <FormControlLabel value="confirm" control={<Radio size="small" slotProps={{ input: { "data-testid": `bulk-choice-${r.id}-confirm` } as React.InputHTMLAttributes<HTMLInputElement> }} />} label="Mesma obra" disabled={busy || !r.candidate} />
                  <FormControlLabel value="ignore" control={<Radio size="small" slotProps={{ input: { "data-testid": `bulk-choice-${r.id}-ignore` } as React.InputHTMLAttributes<HTMLInputElement> }} />} label="Ignorar" disabled={busy} />
                </RadioGroup>
              </Box>
            ))}
          </Box>

          <Box>
            <Button variant="contained" startIcon={<DoneAllIcon />} onClick={() => void apply()} disabled={busy} data-testid="bulk-apply">
              {busy ? "Aplicando…" : `Aplicar as ${rows.length} decisões`}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
