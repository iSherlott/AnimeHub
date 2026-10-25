"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { zonedLocalToUtc } from "@/lib/timeZone";
import { useUnsavedChangesWarning } from "@/lib/useUnsavedChangesWarning";

export type EpisodeFormValues = {
  episodeTitle: string;
  episodeTitleEn: string;
  episodeTitleJa: string;
  synopsis: string;
  thumbnail: string;
  status: string;
  /** exact = dia e hora · day = só o dia · unknown = sem data */
  dateMode: "exact" | "day" | "unknown";
  /** `YYYY-MM-DDTHH:mm` no fuso do admin. */
  local: string;
  airDate: string;
  episode: string;
  workId: string;
};

const TEXT: Array<{ key: "episodeTitle" | "episodeTitleEn" | "episodeTitleJa" | "thumbnail"; label: string; lang?: string }> = [
  { key: "episodeTitle", label: "Título (romaji)" },
  { key: "episodeTitleEn", label: "Título (inglês)" },
  { key: "episodeTitleJa", label: "Título (japonês)", lang: "ja" },
  { key: "thumbnail", label: "Imagem (endereço)" },
];

const show = (v: unknown) => (v === null || v === "" || v === undefined ? "—" : String(v));

/**
 * Edição do episódio global (Fase 4): o admin altera, revisa o antes → depois e confirma. Número, obra, situação e data
 * exigem motivo. O horário é digitado no fuso do admin e enviado como instante (UTC); "só o dia" nunca vira um horário.
 */
export function EpisodeEditForm({ id, updatedAt, initial, manualFields, timeZone, labels, statuses }: { id: string; updatedAt: string; initial: EpisodeFormValues; manualFields: string[]; timeZone: string; labels: Record<string, string>; statuses: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [values, setValues] = useState<EpisodeFormValues>(initial);
  const [protect, setProtect] = useState(true);
  const [unprotect, setUnprotect] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = <K extends keyof EpisodeFormValues>(key: K, value: EpisodeFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const changes = useMemo(() => {
    const out: Record<string, unknown> = {};
    const shown: Array<{ field: string; before: string; after: string }> = [];
    for (const key of ["episodeTitle", "episodeTitleEn", "episodeTitleJa", "synopsis", "thumbnail", "status"] as const) {
      if (values[key] !== initial[key]) {
        out[key] = values[key] === "" ? null : values[key];
        shown.push({ field: key, before: show(initial[key]), after: show(values[key]) });
      }
    }
    if (values.episode !== initial.episode) {
      out.episode = Number(values.episode);
      shown.push({ field: "episode", before: initial.episode, after: values.episode });
    }
    if (values.workId.trim() && values.workId.trim() !== initial.workId) {
      out.workId = values.workId.trim();
      shown.push({ field: "workId", before: initial.workId || "—", after: values.workId.trim() });
    }
    const dateChanged = values.dateMode !== initial.dateMode || (values.dateMode === "exact" && values.local !== initial.local) || (values.dateMode === "day" && values.airDate !== initial.airDate);
    if (dateChanged) {
      const describe = (v: EpisodeFormValues) => (v.dateMode === "exact" ? `${v.local.replace("T", " ")} (${timeZone})` : v.dateMode === "day" ? `${v.airDate} (só o dia)` : "sem data");
      if (values.dateMode === "exact") {
        const at = zonedLocalToUtc(values.local, timeZone);
        out.airingAt = at ? at.toISOString() : "invalido";
        if (initial.dateMode === "day") out.airDate = null;
      } else if (values.dateMode === "day") {
        out.airDate = values.airDate || null;
        if (initial.dateMode === "exact") out.airingAt = null;
      } else {
        if (initial.dateMode === "exact") out.airingAt = null;
        if (initial.dateMode === "day") out.airDate = null;
      }
      shown.push({ field: "airingAt", before: describe(initial), after: describe(values) });
    }
    return { out, shown };
  }, [values, initial, timeZone]);

  const dirty = changes.shown.length > 0 || unprotect.length > 0;
  useUnsavedChangesWarning(dirty && !busy);

  async function save() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/episodes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: updatedAt, changes: changes.out, reason: reason || null, protect, unprotect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors ?? {});
        setMessage({ tone: "error", text: data.error ?? "Não foi possível salvar." });
        setReview(false);
        if (res.status === 409 && data.current) router.refresh();
        return;
      }
      setReview(false);
      setUnprotect([]);
      setReason("");
      setMessage({ tone: "ok", text: `Salvo: ${data.changed.length} campo(s).${data.override ? " O horário virou um override (o original da fonte fica guardado)." : ""}${data.alerts ? " Quem acompanha recebe o aviso de data alterada." : ""}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const label = (key: string, text: string) => (
    <span>
      {text}
      {manualFields.includes(key) && <Chip size="small" label="manual" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
    </span>
  );

  return (
    <Box component="form" data-testid="episode-edit-form" onSubmit={(e) => { e.preventDefault(); if (dirty) setReview(true); }} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        {TEXT.map((f) => (
          <TextField key={f.key} label={label(f.key, f.label)} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} error={Boolean(errors[f.key])} helperText={errors[f.key]} slotProps={{ htmlInput: { lang: f.lang, "data-testid": `ep-edit-${f.key}` } }} />
        ))}
        <TextField label={label("synopsis", "Sinopse")} value={values.synopsis} onChange={(e) => set("synopsis", e.target.value)} multiline minRows={4} error={Boolean(errors.synopsis)} helperText={errors.synopsis} sx={{ gridColumn: { md: "1 / -1" } }} slotProps={{ htmlInput: { "data-testid": "ep-edit-synopsis" } }} />
        <TextField select label={label("status", "Situação informada")} value={values.status} onChange={(e) => set("status", e.target.value)} error={Boolean(errors.status)} helperText={errors.status ?? "\"Exibido\" não se escolhe: vem da data."} slotProps={{ htmlInput: { "data-testid": "ep-edit-status" } }}>
          {statuses.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Número" type="number" value={values.episode} onChange={(e) => set("episode", e.target.value)} error={Boolean(errors.episode)} helperText={errors.episode ?? "Corrigir o número exige motivo."} slotProps={{ htmlInput: { min: 1, "data-testid": "ep-edit-episode" } }} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{label("airingAt", "Data do lançamento")}</Typography>
        <RadioGroup row value={values.dateMode} onChange={(e) => set("dateMode", e.target.value as EpisodeFormValues["dateMode"])}>
          <FormControlLabel value="exact" control={<Radio />} label="Dia e hora" data-testid="ep-edit-mode-exact" />
          <FormControlLabel value="day" control={<Radio />} label="Só o dia (horário desconhecido)" data-testid="ep-edit-mode-day" />
          <FormControlLabel value="unknown" control={<Radio />} label="Sem data" data-testid="ep-edit-mode-unknown" />
        </RadioGroup>
        {values.dateMode === "exact" && (
          <TextField type="datetime-local" label={`Dia e hora (${timeZone})`} value={values.local} onChange={(e) => set("local", e.target.value)} error={Boolean(errors.airingAt)} helperText={errors.airingAt} slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "ep-edit-local" } }} />
        )}
        {values.dateMode === "day" && (
          <TextField type="date" label="Dia" value={values.airDate} onChange={(e) => set("airDate", e.target.value)} error={Boolean(errors.airDate)} helperText={errors.airDate} slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "ep-edit-airdate" } }} />
        )}
      </Box>

      <TextField label="Mover para outra obra (ID do catálogo)" value={values.workId === initial.workId ? "" : values.workId} placeholder="o ID que aparece no endereço /admin/obras/…" onChange={(e) => set("workId", e.target.value || initial.workId)} error={Boolean(errors.workId)} helperText={errors.workId ?? "Só quando o episódio foi ligado à obra errada. Exige motivo."} slotProps={{ htmlInput: { "data-testid": "ep-edit-work" } }} />

      {manualFields.length > 0 && (
        <Box data-testid="ep-edit-unprotect">
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Campos protegidos (corrigidos à mão)</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Desmarque para devolver o campo à fonte.</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {manualFields.map((f) => (
              <FormControlLabel key={f} control={<Checkbox checked={!unprotect.includes(f)} onChange={(e) => setUnprotect((u) => (e.target.checked ? u.filter((x) => x !== f) : [...u, f]))} />} label={labels[f] ?? f} />
            ))}
          </Box>
        </Box>
      )}

      <FormControlLabel control={<Checkbox checked={protect} onChange={(e) => setProtect(e.target.checked)} />} label="Proteger o que eu alterar contra as fontes (AniList, Kitsu, AniDB)" />
      <TextField label="Motivo (obrigatório para número, obra, situação e data)" value={reason} onChange={(e) => setReason(e.target.value)} error={Boolean(errors.reason)} helperText={errors.reason} slotProps={{ htmlInput: { maxLength: 500, "data-testid": "ep-edit-reason" } }} />

      {message && (
        <Typography role="status" data-testid="ep-edit-message" sx={{ fontSize: 14, color: message.tone === "ok" ? "success.main" : "error.main" }}>
          {message.text}
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button type="submit" disabled={!dirty || busy} sx={ELEVATED_BUTTON_SX} data-testid="ep-edit-review">
          Revisar alterações
        </Button>
        <Button type="button" disabled={!dirty || busy} onClick={() => { setValues(initial); setUnprotect([]); setErrors({}); }} sx={ELEVATED_BUTTON_SX}>
          Descartar
        </Button>
      </Box>

      <Dialog open={review} onClose={() => setReview(false)} maxWidth="md" fullWidth>
        <DialogTitle>Confirmar alterações do episódio</DialogTitle>
        <DialogContent>
          <Box component="table" data-testid="ep-edit-diff" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", p: 1, borderTop: 1, borderColor: "divider", verticalAlign: "top", fontSize: 14 } }}>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
              </tr>
            </thead>
            <tbody>
              {changes.shown.map((c) => (
                <tr key={c.field}>
                  <td>{labels[c.field] ?? c.field}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{c.before}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{c.after}</td>
                </tr>
              ))}
              {unprotect.map((f) => (
                <tr key={`u-${f}`}>
                  <td>{labels[f] ?? f}</td>
                  <td>protegido</td>
                  <td>volta à fonte</td>
                </tr>
              ))}
            </tbody>
          </Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
            Mudar a data atualiza o calendário; quem acompanha a obra recebe o aviso de data alterada uma vez.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReview(false)} autoFocus>
            Voltar
          </Button>
          <Button onClick={() => void save()} disabled={busy} variant="contained" data-testid="ep-edit-confirm">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
