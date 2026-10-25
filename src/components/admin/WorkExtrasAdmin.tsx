"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import { EXTRA_KINDS, type ExtraView } from "@/lib/episodeExtrasView";

export type AdminExtra = ExtraView & { updatedAt: string; manualFields: string[] };

const FIELDS = [
  { key: "title", label: "Título (romaji)" },
  { key: "titleEn", label: "Título (inglês)" },
  { key: "titleJa", label: "Título (japonês)", lang: "ja" },
] as const;
const LABELS: Record<string, string> = { title: "Título (romaji)", titleEn: "Título (inglês)", titleJa: "Título (japonês)", synopsis: "Sinopse", airDate: "Dia" };
type Values = { title: string; titleEn: string; titleJa: string; synopsis: string; airDate: string };
const valuesOf = (e: AdminExtra): Values => ({ title: e.title ?? "", titleEn: e.titleEn ?? "", titleJa: e.titleJa ?? "", synopsis: e.synopsis ?? "", airDate: e.airDate ?? "" });

/**
 * Extras do AniDB no detalhe da obra (especiais, aberturas e encerramentos, trailers…): fora da sequência 1, 2, 3. O admin
 * corrige título, sinopse e dia; o que corrigir fica protegido contra o AniDB, salvo se desmarcar.
 */
export function WorkExtrasAdmin({ extras }: { extras: AdminExtra[] }) {
  const [editing, setEditing] = useState<AdminExtra | null>(null);
  if (extras.length === 0) {
    return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum extra registrado. Eles vêm do AniDB com os episódios (botão &quot;Buscar episódios no AniDB&quot;).</Typography>;
  }
  return (
    <>
      <Box component="table" data-testid="work-extras-admin" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", p: 1, borderTop: 1, borderColor: "divider", verticalAlign: "top", fontSize: 14 } }}>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Extras da obra</caption>
        <thead>
          <tr>
            <th>Código</th>
            <th>Tipo</th>
            <th>Título</th>
            <th>Dia</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {extras.map((e) => (
            <tr key={e.id} data-testid={`admin-extra-${e.code}`}>
              <td>{e.code}</td>
              <td>{EXTRA_KINDS[e.kind]}</td>
              <td style={{ overflowWrap: "anywhere" }}>
                {e.titleJa ?? e.title ?? e.titleEn ?? "—"}
                {e.manualFields.length > 0 && <Chip size="small" label="manual" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
              </td>
              <td>{e.airDate ?? "—"}</td>
              <td>
                <Button size="small" onClick={() => setEditing(e)} data-testid={`admin-extra-edit-${e.code}`}>
                  Editar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
      {editing && <ExtraEditDialog key={editing.id} extra={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExtraEditDialog({ extra, onClose }: { extra: AdminExtra; onClose: () => void }) {
  const router = useRouter();
  const initial = valuesOf(extra);
  const [values, setValues] = useState<Values>(initial);
  const [protect, setProtect] = useState(true);
  const [unprotect, setUnprotect] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = (key: keyof Values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const changes = Object.fromEntries((Object.keys(values) as Array<keyof Values>).filter((k) => values[k] !== initial[k]).map((k) => [k, values[k] === "" ? null : values[k]]));
  const dirty = Object.keys(changes).length > 0 || unprotect.length > 0;
  const label = (key: string, text: string) => (
    <span>
      {text}
      {extra.manualFields.includes(key) && <Chip size="small" label="manual" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
    </span>
  );

  async function save() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/extras/${extra.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: extra.updatedAt, changes, reason: reason || null, protect, unprotect }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors ?? {});
        setMessage(data.error ?? "Não foi possível salvar.");
        if (res.status === 409) router.refresh();
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Editar extra {extra.code} · {EXTRA_KINDS[extra.kind]}
      </DialogTitle>
      <DialogContent>
        <Box component="form" id="extra-edit-form" data-testid="extra-edit-form" onSubmit={(e) => { e.preventDefault(); if (dirty) void save(); }} sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {FIELDS.map((f) => (
            <TextField key={f.key} label={label(f.key, f.label)} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} error={Boolean(errors[f.key])} helperText={errors[f.key]} slotProps={{ htmlInput: { lang: "lang" in f ? f.lang : undefined, "data-testid": `extra-edit-${f.key}` } }} />
          ))}
          <TextField label={label("synopsis", "Sinopse")} value={values.synopsis} onChange={(e) => set("synopsis", e.target.value)} multiline minRows={3} error={Boolean(errors.synopsis)} helperText={errors.synopsis} slotProps={{ htmlInput: { "data-testid": "extra-edit-synopsis" } }} />
          <TextField type="date" label={label("airDate", "Dia")} value={values.airDate} onChange={(e) => set("airDate", e.target.value)} error={Boolean(errors.airDate)} helperText={errors.airDate ?? "Só o dia: o AniDB não informa horário."} slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "extra-edit-airDate" } }} />
          {extra.manualFields.length > 0 && (
            <Box data-testid="extra-edit-unprotect">
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Campos protegidos (corrigidos à mão)</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Desmarque para devolver o campo ao AniDB.</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {extra.manualFields.map((f) => (
                  <FormControlLabel key={f} control={<Checkbox checked={!unprotect.includes(f)} onChange={(e) => setUnprotect((u) => (e.target.checked ? u.filter((x) => x !== f) : [...u, f]))} />} label={LABELS[f] ?? f} />
                ))}
              </Box>
            </Box>
          )}
          <FormControlLabel control={<Checkbox checked={protect} onChange={(e) => setProtect(e.target.checked)} />} label="Proteger o que eu alterar contra o AniDB" />
          <TextField label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, "data-testid": "extra-edit-reason" } }} />
          {message && (
            <Typography role="status" data-testid="extra-edit-message" sx={{ fontSize: 14, color: "error.main" }}>
              {message}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="extra-edit-form" disabled={!dirty || busy} variant="contained" data-testid="extra-edit-save">
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
