"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import type { AlbumWork } from "@/lib/profileAlbums";

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const errorOf = (data: Record<string, unknown>) => (typeof data.error === "string" ? data.error : "Não foi possível salvar. Tente de novo.");
const normalize = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Nome e descrição do álbum (criar ou editar). */
function AlbumForm({ open, title, initial, submitLabel, onClose, onSubmit }: { open: boolean; title: string; initial: { name: string; description: string }; submitLabel: string; onClose: () => void; onSubmit: (v: { name: string; description: string }) => Promise<string | null> }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSubmit({ name, description });
    setBusy(false);
    if (err) setError(err);
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField label="Nome do álbum" value={name} onChange={(e) => setName(e.target.value)} error={Boolean(error)} helperText={error ?? "Ex.: Para maratonar no inverno, Clássicos que recomendo"} slotProps={{ htmlInput: { maxLength: 60, "data-testid": "album-name" } }} />
        <TextField label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300, "data-testid": "album-description" } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void submit()} data-testid="album-save">
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "+ Novo álbum" no próprio perfil: cria e abre o álbum para escolher as obras. */
export function NewAlbumButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} sx={ELEVATED_BUTTON_SX} data-testid="album-new">
        + Novo álbum
      </Button>
      {open && (
        <AlbumForm
          open
          title="Novo álbum"
          initial={{ name: "", description: "" }}
          submitLabel="Criar e escolher os animes"
          onClose={() => setOpen(false)}
          onSubmit={async (v) => {
            const r = await send("/api/albums", "POST", v);
            if (!r.ok) return errorOf(r.data);
            router.push(`/users/${userId}/albuns/${String(r.data.id)}`);
            return null;
          }}
        />
      )}
    </>
  );
}

/**
 * Editar o álbum personalizado: renomear, apagar, tirar obras e colocar obras da própria lista (com busca). `inAlbum`
 * são as chaves das obras (não das temporadas) que já estão no álbum.
 */
export function AlbumEditor({ userId, albumId, name, description, inAlbum, candidates }: { userId: string; albumId: string; name: string; description: string | null; inAlbum: string[]; candidates: AlbumWork[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inSet = useMemo(() => new Set(inAlbum), [inAlbum]);
  const available = useMemo(() => {
    const q = normalize(query.trim());
    return candidates.filter((c) => c.animeId && !inSet.has(c.key) && (!q || normalize([c.titleRomaji, c.titleEnglish, c.titleNative].filter(Boolean).join(" ")).includes(q)));
  }, [candidates, inSet, query]);

  async function add(animeId: string) {
    setBusy(animeId);
    setError(null);
    const r = await send(`/api/albums/${albumId}/items`, "PUT", { animeId });
    setBusy(null);
    if (!r.ok) return setError(errorOf(r.data));
    router.refresh();
  }
  async function remove() {
    if (!window.confirm("Apagar este álbum? As obras continuam na sua lista.")) return;
    const r = await send(`/api/albums/${albumId}`, "DELETE");
    if (r.ok) router.push(`/users/${userId}#albuns`);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="album-editor">
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button size="small" onClick={() => setEditing(true)} sx={ELEVATED_BUTTON_SX} data-testid="album-edit">
          Renomear
        </Button>
        <Button size="small" color="error" onClick={() => void remove()} data-testid="album-delete">
          Apagar álbum
        </Button>
      </Box>
      {editing && (
        <AlbumForm
          open
          title="Editar álbum"
          initial={{ name, description: description ?? "" }}
          submitLabel="Salvar"
          onClose={() => setEditing(false)}
          onSubmit={async (v) => {
            const r = await send(`/api/albums/${albumId}`, "PATCH", v);
            if (!r.ok) return errorOf(r.data);
            setEditing(false);
            router.refresh();
            return null;
          }}
        />
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: "12px", bgcolor: "#171820" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Colocar animes da sua lista</Typography>
        <TextField size="small" placeholder="Buscar na sua lista" value={query} onChange={(e) => setQuery(e.target.value)} slotProps={{ htmlInput: { "aria-label": "Buscar na sua lista", "data-testid": "album-search" } }} />
        {error && (
          <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
            {error}
          </Typography>
        )}
        {available.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{candidates.length === 0 ? "Sua lista está vazia: acompanhe animes para montar álbuns." : "Nada a colocar com essa busca."}</Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto" }}>
            {available.slice(0, 60).map((c) => (
              <Box component="li" key={c.animeId} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }} data-testid={`album-candidate-${c.key}`}>
                <Box sx={{ position: "relative", width: 32, height: 46, borderRadius: "4px", overflow: "hidden", bgcolor: "#0d0e14", flexShrink: 0 }}>{c.coverImage && <CoverImage src={c.coverImage} sizes="32px" />}</Box>
                <Typography sx={{ fontSize: 14, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  <AnimeTitle titles={{ titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative }} />
                </Typography>
                <Button size="small" variant="contained" disabled={busy === c.animeId} onClick={() => void add(c.animeId as string)} data-testid={`album-add-${c.key}`}>
                  Colocar
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Tirar uma obra do álbum (no cartão da obra, para o dono). */
export function AlbumRemoveItem({ albumId, animeId, testId }: { albumId: string; animeId: string; testId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const r = await send(`/api/albums/${albumId}/items/${animeId}`, "DELETE");
    setBusy(false);
    if (r.ok) router.refresh();
  }
  return (
    <Button size="small" color="inherit" disabled={busy} onClick={() => void remove()} sx={{ alignSelf: "flex-start", fontSize: 11, color: "text.secondary", minWidth: 0, p: 0.25 }} data-testid={testId}>
      Tirar
    </Button>
  );
}
