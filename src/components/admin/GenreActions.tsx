"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Msg = { tone: "ok" | "error"; text: string } | null;

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

/** Criar gênero (ou registrar um que apareceu nas obras sem estar no vocabulário). */
export function GenreCreateForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [aliases, setAliases] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <Box component="form" onSubmit={async (e) => { e.preventDefault(); const r = await send("/api/admin/genres", "POST", { key, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean) }); setMsg(r.ok ? { tone: "ok", text: "Gênero criado." } : { tone: "error", text: String(r.data.error ?? "Não foi possível criar.") }); if (r.ok) { setKey(""); setAliases(""); router.refresh(); } }} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
      <TextField label="Novo gênero" value={key} onChange={(e) => setKey(e.target.value)} slotProps={{ htmlInput: { maxLength: 40, "data-testid": "genre-new-key" } }} />
      <TextField label="Variações (separadas por vírgula)" value={aliases} onChange={(e) => setAliases(e.target.value)} sx={{ minWidth: 260 }} slotProps={{ htmlInput: { "data-testid": "genre-new-aliases" } }} />
      <Button type="submit" disabled={!key.trim()} sx={ELEVATED_BUTTON_SX} data-testid="genre-create">
        Criar
      </Button>
      {msg && <Typography role="status" data-testid="genre-create-message" sx={{ fontSize: 14, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
    </Box>
  );
}

/**
 * Editar, renomear, mesclar e excluir um gênero (Fase 7). Mesclar e excluir mostram quantas obras serão afetadas; excluir
 * um gênero com obras exige escolher entre transferir para outro gênero ou remover das obras.
 */
export function GenreActions({ genreKey, label, description, aliases, adult, works, targets, editable }: { genreKey: string; label: string; description: string | null; aliases: string[]; adult: boolean; works: number; targets: string[]; editable: boolean }) {
  const router = useRouter();
  const url = `/api/admin/genres/${encodeURIComponent(genreKey)}`;
  const [form, setForm] = useState({ label, description: description ?? "", aliases: aliases.join(", "), adult });
  const [target, setTarget] = useState("");
  const [newKey, setNewKey] = useState("");
  const [mode, setMode] = useState<"transfer" | "remove">("transfer");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function run(method: string, body: unknown, done: (d: Record<string, unknown>) => string, after?: (d: Record<string, unknown>) => void) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await send(url, method, body);
      setMsg(r.ok ? { tone: "ok", text: done(r.data) } : { tone: "error", text: String(r.data.error ?? "Não foi possível.") });
      if (r.ok && after) after(r.data);
      else if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const message = msg && <Typography role="status" data-testid="genre-message" sx={{ fontSize: 14, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>;
  // Depois de mesclar ou excluir, a página recarrega já sem edição: o aviso do que foi feito continua visível.
  if (!editable)
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {message}
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Gênero mesclado ou excluído: só consulta.</Typography>
      </Box>
    );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Editar</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
          <TextField label="Rótulo (como aparece)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} slotProps={{ htmlInput: { "data-testid": "genre-label" } }} />
          <TextField label="Variações (vírgula)" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} slotProps={{ htmlInput: { "data-testid": "genre-aliases" } }} />
          <TextField label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline minRows={2} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
        <FormControlLabel control={<Checkbox checked={form.adult} onChange={(e) => setForm({ ...form, adult: e.target.checked })} />} label="Marca conteúdo adulto (+18)" />
        <Box>
          <Button disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="genre-save" onClick={() => void run("PATCH", { label: form.label, description: form.description || null, aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean), adult: form.adult }, () => "Gênero salvo.")}>
            Salvar
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Renomear a chave</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Cria o nome novo e mescla este nele: as {works} obra(s) acompanham, e o nome antigo vira variação.</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField label="Novo nome" value={newKey} onChange={(e) => setNewKey(e.target.value)} slotProps={{ htmlInput: { "data-testid": "genre-rename-key" } }} />
          <Button disabled={busy || !newKey.trim()} sx={ELEVATED_BUTTON_SX} data-testid="genre-rename" onClick={() => void run("POST", { action: "rename", newKey }, (d) => `Renomeado: ${d.works} obra(s) atualizadas.`, () => router.push(`/admin/taxonomia/${encodeURIComponent(newKey.trim())}`))}>
            Renomear
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Mesclar em outro gênero</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }} data-testid="genre-merge-impact">{works} obra(s) passam a ter o gênero escolhido; gravações futuras com &quot;{genreKey}&quot; também.</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField select label="Destino" value={target} onChange={(e) => setTarget(e.target.value)} sx={{ minWidth: 220 }} slotProps={{ htmlInput: { "data-testid": "genre-target" } }}>
            {targets.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { "data-testid": "genre-reason" } }} />
          <Button disabled={busy || !target} sx={ELEVATED_BUTTON_SX} data-testid="genre-merge" onClick={() => void run("POST", { action: "merge", target, reason }, (d) => `Mesclado: ${d.works} obra(s) atualizadas.`)}>
            Mesclar
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="genre-delete-box">
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Excluir</Typography>
        {works > 0 ? (
          <>
            <Typography sx={{ fontSize: 13, color: "warning.main" }} data-testid="genre-delete-impact">{works} obra(s) têm este gênero. Escolha o que acontece com elas:</Typography>
            <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as "transfer" | "remove")}>
              <FormControlLabel value="transfer" control={<Radio />} label="Transferir para o gênero de destino (acima)" data-testid="genre-delete-transfer" />
              <FormControlLabel value="remove" control={<Radio />} label="Remover o gênero das obras" data-testid="genre-delete-remove" />
            </RadioGroup>
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nenhuma obra tem este gênero.</Typography>
        )}
        <FormControlLabel control={<Checkbox checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />} label={`Confirmo a exclusão${works ? ` (${works} obra(s) afetadas)` : ""}`} data-testid="genre-delete-confirm" />
        <Box>
          <Button disabled={busy || !confirmDelete || (works > 0 && mode === "transfer" && !target)} color="error" variant="outlined" data-testid="genre-delete" onClick={() => void run("POST", { action: "delete", ...(works > 0 ? { mode, target: mode === "transfer" ? target : undefined } : {}), reason }, (d) => `Excluído: ${d.works} obra(s) atualizadas.`)}>
            Excluir
          </Button>
        </Box>
      </Box>
      {message}
    </Box>
  );
}
