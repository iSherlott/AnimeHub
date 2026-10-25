"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { useUnsavedChangesWarning } from "@/lib/useUnsavedChangesWarning";

export type EditableValues = {
  titleRomaji: string;
  titleEnglish: string;
  titleNative: string;
  description: string;
  descriptionPt: string;
  format: string;
  kind: string;
  status: string;
  episodes: string;
  season: string;
  seasonYear: string;
  startDate: string;
  endDate: string;
  genres: string[];
  coverImage: string;
  bannerImage: string;
  officialSite: string;
};

type Options = { formats: readonly string[]; kinds: Array<{ value: string; label: string }>; statuses: Array<{ value: string; label: string }>; seasons: Array<{ value: string; label: string }>; genres: readonly string[]; labels: Record<string, string> };

const TEXT_FIELDS: Array<{ key: keyof EditableValues; multiline?: boolean; lang?: string }> = [
  { key: "titleNative", lang: "ja" },
  { key: "titleRomaji" },
  { key: "titleEnglish" },
  { key: "description", multiline: true },
  { key: "descriptionPt", multiline: true },
  { key: "coverImage" },
  { key: "bannerImage" },
  { key: "officialSite" },
];

/** Converte o valor do formulário para o que a API espera (vazio = nulo; números e listas no tipo certo). */
function toApi(key: keyof EditableValues, value: EditableValues[keyof EditableValues]): unknown {
  if (key === "genres") return (value as string[]).length ? value : null;
  if (key === "episodes" || key === "seasonYear") return value === "" ? null : Number(value);
  return value === "" ? null : value;
}

const show = (v: unknown) => (v === null || v === "" || (Array.isArray(v) && v.length === 0) ? "—" : Array.isArray(v) ? v.join(", ") : String(v));

/**
 * Edição da obra (Fase 3): o admin altera os campos, revisa a lista do que muda (antes → depois) e confirma. O que ele
 * corrige fica protegido contra a importação (pode desmarcar); um campo já protegido pode ser devolvido à fonte. Se a obra
 * mudou enquanto a página estava aberta, a API recusa (409) e o formulário mostra os valores atuais.
 */
export function WorkEditForm({ id, updatedAt, initial, manualFields, options }: { id: string; updatedAt: string; initial: EditableValues; manualFields: string[]; options: Options }) {
  const router = useRouter();
  const [values, setValues] = useState<EditableValues>(initial);
  const [protect, setProtect] = useState(true);
  const [unprotect, setUnprotect] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const changes = useMemo(() => {
    const out: Array<{ key: keyof EditableValues; before: unknown; after: unknown }> = [];
    for (const key of Object.keys(values) as Array<keyof EditableValues>) {
      if (JSON.stringify(values[key]) !== JSON.stringify(initial[key])) out.push({ key, before: toApi(key, initial[key]), after: toApi(key, values[key]) });
    }
    return out;
  }, [values, initial]);

  const set = <K extends keyof EditableValues>(key: K, value: EditableValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = changes.length > 0 || unprotect.length > 0;
  useUnsavedChangesWarning(dirty && !busy);

  async function save() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/works/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: updatedAt, changes: Object.fromEntries(changes.map((c) => [c.key, c.after])), reason: reason || null, protect, unprotect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors ?? {});
        setMessage({ tone: "error", text: data.error ?? "Não foi possível salvar." });
        setReview(false);
        if (res.status === 409) router.refresh();
        return;
      }
      setReview(false);
      setUnprotect([]);
      setReason("");
      setMessage({ tone: "ok", text: `Salvo: ${data.changed.length} campo(s). Cópias atualizadas: ${data.propagated.productions} página(s), ${data.propagated.listEntries} item(ns) de lista, ${data.propagated.schedule} episódio(s) da agenda.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const label = (key: string) => (
    <span>
      {options.labels[key] ?? key}
      {manualFields.includes(key) && <Chip size="small" label="manual" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
    </span>
  );

  return (
    <Box component="form" data-testid="work-edit-form" onSubmit={(e) => { e.preventDefault(); if (dirty) setReview(true); }} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        {TEXT_FIELDS.map((f) => (
          <TextField
            key={f.key}
            label={label(f.key)}
            value={values[f.key] as string}
            onChange={(e) => set(f.key, e.target.value as never)}
            multiline={f.multiline}
            minRows={f.multiline ? 4 : undefined}
            error={Boolean(errors[f.key])}
            helperText={errors[f.key]}
            slotProps={{ htmlInput: { lang: f.lang, "data-testid": `edit-${f.key}` } }}
            sx={f.multiline ? { gridColumn: { md: "1 / -1" } } : undefined}
          />
        ))}
        <TextField select label={label("format")} value={values.format} onChange={(e) => set("format", e.target.value)} error={Boolean(errors.format)} helperText={errors.format} slotProps={{ htmlInput: { "data-testid": "edit-format" } }}>
          <MenuItem value="">—</MenuItem>
          {options.formats.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </TextField>
        <TextField select label={label("kind")} value={values.kind} onChange={(e) => set("kind", e.target.value)} error={Boolean(errors.kind)} helperText={errors.kind}>
          <MenuItem value="">—</MenuItem>
          {options.kinds.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
        </TextField>
        <TextField select label={label("status")} value={values.status} onChange={(e) => set("status", e.target.value)} error={Boolean(errors.status)} helperText={errors.status}>
          <MenuItem value="">—</MenuItem>
          {options.statuses.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField label={label("episodes")} type="number" value={values.episodes} onChange={(e) => set("episodes", e.target.value)} error={Boolean(errors.episodes)} helperText={errors.episodes ?? "Total informado pela fonte (não é o número de lançados)."} slotProps={{ htmlInput: { min: 1, "data-testid": "edit-episodes" } }} />
        <TextField select label={label("season")} value={values.season} onChange={(e) => set("season", e.target.value)} error={Boolean(errors.season)} helperText={errors.season}>
          <MenuItem value="">—</MenuItem>
          {options.seasons.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField label={label("seasonYear")} type="number" value={values.seasonYear} onChange={(e) => set("seasonYear", e.target.value)} error={Boolean(errors.seasonYear)} helperText={errors.seasonYear} />
        <TextField label={label("startDate")} type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} error={Boolean(errors.startDate)} helperText={errors.startDate} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label={label("endDate")} type="date" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} error={Boolean(errors.endDate)} helperText={errors.endDate} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>{label("genres")}</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} data-testid="edit-genres">
          {options.genres.map((g) => {
            const on = values.genres.includes(g);
            return (
              <Chip
                key={g}
                label={g}
                clickable
                color={on ? "primary" : "default"}
                variant={on ? "filled" : "outlined"}
                aria-pressed={on}
                onClick={() => set("genres", on ? values.genres.filter((x) => x !== g) : [...values.genres, g])}
              />
            );
          })}
        </Box>
        {errors.genres && <Typography sx={{ fontSize: 13, color: "error.main" }}>{errors.genres}</Typography>}
      </Box>

      {manualFields.length > 0 && (
        <Box data-testid="edit-unprotect">
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Campos protegidos (corrigidos à mão)</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Desmarque para devolver o campo à fonte: a próxima importação ou curadoria volta a atualizá-lo.</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {manualFields.map((f) => (
              <FormControlLabel key={f} control={<Checkbox checked={!unprotect.includes(f)} onChange={(e) => setUnprotect((u) => (e.target.checked ? u.filter((x) => x !== f) : [...u, f]))} />} label={options.labels[f] ?? f} />
            ))}
          </Box>
        </Box>
      )}

      <FormControlLabel control={<Checkbox checked={protect} onChange={(e) => setProtect(e.target.checked)} />} label="Proteger o que eu alterar contra a importação e a curadoria" />
      <TextField label="Motivo (opcional, fica no histórico)" value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, "data-testid": "edit-reason" } }} />

      {message && (
        <Typography role="status" data-testid="work-edit-message" sx={{ fontSize: 14, color: message.tone === "ok" ? "success.main" : "error.main" }}>
          {message.text}
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button type="submit" disabled={!dirty || busy} sx={ELEVATED_BUTTON_SX} data-testid="work-edit-review">
          Revisar alterações
        </Button>
        <Button type="button" disabled={!dirty || busy} onClick={() => { setValues(initial); setUnprotect([]); setErrors({}); }} sx={ELEVATED_BUTTON_SX}>
          Descartar
        </Button>
      </Box>

      <Dialog open={review} onClose={() => setReview(false)} maxWidth="md" fullWidth>
        <DialogTitle>Confirmar alterações</DialogTitle>
        <DialogContent>
          <Box component="table" data-testid="work-edit-diff" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", p: 1, borderTop: 1, borderColor: "divider", verticalAlign: "top", fontSize: 14 } }}>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.key}>
                  <td>{options.labels[c.key] ?? c.key}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{show(c.before)}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{show(c.after)}</td>
                </tr>
              ))}
              {unprotect.map((f) => (
                <tr key={`u-${f}`}>
                  <td>{options.labels[f] ?? f}</td>
                  <td>protegido</td>
                  <td>volta à fonte</td>
                </tr>
              ))}
            </tbody>
          </Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
            {protect && changes.length > 0 ? "Os campos alterados ficam protegidos contra a importação. " : ""}Títulos, capa, sinopse, ficha e gêneros também são levados à página pública, às listas e à agenda.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReview(false)} autoFocus>
            Voltar
          </Button>
          <Button onClick={() => void save()} disabled={busy} variant="contained" data-testid="work-edit-confirm">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
