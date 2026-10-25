"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import type { FieldDiff, FieldUpdatePreview, FieldUpdateResult } from "@/lib/fieldUpdate";

type Item = { id: string; catalogEntryId: string; anilistId: number | null; title: string; state: string; message: string | null; diff: FieldDiff[]; selected: string[] };
type Data = { job: { seq: number; state: string; stage: string; label: string | null; result: FieldUpdateResult | null }; items: Item[]; preview: FieldUpdatePreview };

const STATE_LABEL: Record<string, string> = { PENDING: "aguardando coleta", COLLECTED: "coletada", NOT_FOUND: "não encontrada", FAILED: "falha", APPLIED: "atualizada", UNCHANGED: "sem mudança", SKIPPED: "ignorada", CONFLICT: "conflito" };
const short = (v: string | null) => (v === null ? "—" : v.length > 120 ? `${v.replace(/<[^>]+>/g, "").slice(0, 120)}…` : v);

/**
 * Revisão do lote de atualização seletiva (Fase 6): tabela de diferenças por obra (atual × recebido, protegido, sem
 * valor na fonte), escolha por grupo de campos com exceções por obra, prévia, execução com confirmação e resultado,
 * com reprocessamento das falhas.
 */
export function FieldUpdateReview({ seq, groups, labels }: { seq: number; groups: Record<string, { label: string; fields: string[] }>; labels: Record<string, string> }) {
  const [data, setData] = useState<Data | null>(null);
  const [fields, setFields] = useState<Set<string>>(new Set());
  const [includeProtected, setIncludeProtected] = useState(false);
  const [perItem, setPerItem] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/field-updates/${seq}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [seq]);
  useEffect(() => {
    // Busca inicial do lote (sem lib de fetch, o padrão do projeto é buscar no efeito).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const changedFields = useMemo(() => new Set<string>((data?.items ?? []).flatMap((i) => i.diff.filter((d) => d.changed).map((d) => d.field))), [data]);

  async function post(body: Record<string, unknown>, ok: (json: Record<string, unknown>) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/field-updates/${seq}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      setMessage(res.ok ? { tone: "ok", text: ok(json) } : { tone: "error", text: json.error ?? "Não foi possível." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Carregando o lote…</Typography>;
  const { job, items, preview } = data;
  const reviewing = job.stage === "REVIEW";
  const toggleGroup = (list: string[], on: boolean) => setFields((cur) => { const next = new Set(cur); for (const f of list) if (on) next.add(f); else next.delete(f); return next; });
  const toggleItemField = (item: Item, field: string, on: boolean) =>
    setPerItem((cur) => {
      const base = cur[item.id] ?? item.diff.filter((d) => d.changed && fields.has(d.field) && (!d.protected || includeProtected)).map((d) => d.field);
      const next = on ? [...new Set([...base, field])] : base.filter((f) => f !== field);
      return { ...cur, [item.id]: next };
    });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="field-update-review">
      {reviewing && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Campos a atualizar (em todas as obras onde a AniList trouxe valor diferente)</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {Object.entries(groups).map(([key, g]) => {
              const relevant = g.fields.filter((f) => changedFields.has(f));
              const on = relevant.length > 0 && relevant.every((f) => fields.has(f));
              return (
                <FormControlLabel key={key} control={<Checkbox checked={on} disabled={relevant.length === 0} onChange={(e) => toggleGroup(relevant, e.target.checked)} />} label={`${g.label}${relevant.length ? "" : " (sem mudança)"}`} data-testid={`fu-group-${key}`} />
              );
            })}
          </Box>
          <FormControlLabel control={<Checkbox checked={includeProtected} onChange={(e) => setIncludeProtected(e.target.checked)} />} label="Incluir campos protegidos (corrigidos à mão) — eles voltam a seguir a fonte" data-testid="fu-include-protected" />
          <Box>
            <Button onClick={() => void post({ action: "select", fields: [...fields], includeProtected, perItem }, (j) => `Escolha salva: ${j.selected} campo(s).`)} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="fu-select">
              Aplicar a escolha e ver a prévia
            </Button>
          </Box>
        </Box>
      )}

      <Box data-testid="fu-preview" sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px", fontSize: 14, display: "flex", flexDirection: "column", gap: 0.5 }}>
        <strong>Prévia</strong>
        <span data-testid="fu-preview-affected">{`${preview.affected} de ${preview.works} obra(s) serão atualizadas`}</span>
        <span>{Object.entries(preview.fields).map(([f, n]) => `${labels[f] ?? f}: ${n}`).join(" · ") || "Nenhum campo escolhido."}</span>
        <span>{`Sem mudança: ${preview.unchanged} · ignoradas: ${preview.ignored} · não encontradas: ${preview.notFound} · falhas: ${preview.failed}`}</span>
        <span data-testid="fu-preview-protected">{`Valores manuais preservados: ${preview.protectedKept} · protegidos que serão sobrescritos: ${preview.protectedOverwritten}`}</span>
        <span>{`Afeta calendário/situação: ${preview.calendarImpact} obra(s) · afeta páginas públicas: ${preview.publicImpact} obra(s)`}</span>
      </Box>

      {reviewing && (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          {preview.needsConfirmation && <FormControlLabel control={<Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />} label="Confirmo esta operação de grande impacto" data-testid="fu-confirm" />}
          <Button onClick={() => void post({ action: "apply", confirm }, (j) => { const r = j.result as FieldUpdateResult; return `Executado: ${r.applied} atualizada(s), ${r.unchanged} sem mudança, ${r.skipped} ignorada(s), ${r.conflicts} conflito(s), ${r.failed} falha(s).`; })} disabled={busy || preview.affected === 0 || (preview.needsConfirmation && !confirm)} variant="contained" data-testid="fu-apply">
            Executar
          </Button>
        </Box>
      )}
      {job.stage === "DONE" && job.result && (
        <Box data-testid="fu-result" sx={{ fontSize: 14 }}>
          {`Resultado: ${job.result.processed} processada(s) · ${job.result.applied} atualizada(s) · ${job.result.unchanged} sem mudança · ${job.result.skipped} ignorada(s) · ${job.result.conflicts} conflito(s) · ${job.result.failed} falha(s)`}
        </Box>
      )}
      {items.some((i) => ["FAILED", "NOT_FOUND", "CONFLICT"].includes(i.state)) && job.stage !== "APPLY" && (
        <Box>
          <Button onClick={() => void post({ action: "retry" }, (j) => `${j.retried} item(ns) recoletado(s).`)} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="fu-retry">
            Reprocessar falhas e conflitos
          </Button>
        </Box>
      )}
      {message && (
        <Typography role="status" data-testid="fu-message" sx={{ fontSize: 14, color: message.tone === "ok" ? "success.main" : "error.main" }}>
          {message.text}
        </Typography>
      )}

      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {items.map((item) => (
          <Box component="li" key={item.id} data-testid={`fu-item-${item.catalogEntryId}`} data-state={item.state} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.5 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <a href={`/admin/obras/${item.catalogEntryId}`} style={{ color: "inherit", fontWeight: 700 }}>{item.title}</a>
              <Chip size="small" label={STATE_LABEL[item.state] ?? item.state} />
              {item.message && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{item.message}</Typography>}
            </Box>
            {item.diff.some((d) => d.changed || d.protected) && (
              <Box sx={{ overflowX: "auto" }}>
                <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", p: 0.75, borderTop: 1, borderColor: "divider", verticalAlign: "top", fontSize: 13 } }}>
                  <thead>
                    <tr>
                      <th />
                      <th>Campo</th>
                      <th>Atual</th>
                      <th>Recebido (AniList)</th>
                      <th>Sinais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.diff
                      .filter((d) => d.changed || d.protected)
                      .map((d) => {
                        const chosen = (perItem[item.id] ?? item.selected).includes(d.field);
                        return (
                          <tr key={d.field} data-testid={`fu-diff-${item.catalogEntryId}-${d.field}`}>
                            <td>{reviewing && item.state === "COLLECTED" && d.changed && <Checkbox size="small" checked={chosen} onChange={(e) => toggleItemField(item, d.field, e.target.checked)} slotProps={{ input: { "aria-label": `Atualizar ${labels[d.field] ?? d.field} de ${item.title}` } }} />}</td>
                            <td>{labels[d.field] ?? d.field}</td>
                            <td style={{ overflowWrap: "anywhere" }}>{short(d.current)}</td>
                            <td style={{ overflowWrap: "anywhere" }}>{d.missing ? "a fonte não informa" : short(d.incoming)}</td>
                            <td>
                              {d.changed && <Chip size="small" label="mudou" sx={{ mr: 0.5 }} />}
                              {d.protected && <Chip size="small" color="warning" label="protegido" />}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
