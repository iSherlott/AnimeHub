"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Box, Button, Checkbox, FormControlLabel, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Errors = Record<string, string>;

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/** "Participar" / "Sair da comunidade". Sem conta, leva ao login e volta para a comunidade. */
export function JoinButton({ communityKey, member, loggedIn }: { communityKey: string; member: boolean; loggedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!loggedIn) {
    return (
      <Button component={NextLink} href={`/login?next=${encodeURIComponent(`/comunidades/${communityKey}`)}`} variant="contained" data-testid="community-login">
        Entre para participar
      </Button>
    );
  }
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const r = await send(`/api/communities/${communityKey}/membership`, member ? "DELETE" : "POST");
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível. Tente novamente."));
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Button onClick={() => void toggle()} disabled={busy} variant={member ? "outlined" : "contained"} data-testid={member ? "community-leave" : "community-join"}>
        {member ? "Sair da comunidade" : "Participar"}
      </Button>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** Texto com spoiler: fica escondido até a pessoa escolher mostrar. */
export function SpoilerText({ text, isSpoiler, testId }: { text: string; isSpoiler: boolean; testId?: string }) {
  const [shown, setShown] = useState(!isSpoiler);
  if (!shown) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1.5, borderRadius: "10px", bgcolor: "#171820" }} data-testid={testId ? `${testId}-spoiler` : undefined}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Contém spoiler.</Typography>
        <Button size="small" onClick={() => setShown(true)}>
          Mostrar
        </Button>
      </Box>
    );
  }
  return (
    <Typography data-testid={testId} sx={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {text}
    </Typography>
  );
}

/** Novo tópico: título, mensagem, de qual obra da franquia fala (opcional), spoiler e enquete (opcional). */
export function NewTopicForm({ communityKey, works }: { communityKey: string; works: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [withPoll, setWithPoll] = useState(false);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);

  if (!open) {
    return (
      <Box>
        <Button onClick={() => setOpen(true)} variant="contained" data-testid="new-topic-open">
          + Novo tópico
        </Button>
      </Box>
    );
  }

  async function submit() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const r = await send(`/api/communities/${communityKey}/topics`, "POST", { title, body, isSpoiler: spoiler, catalogEntryId: about || null, poll: withPoll ? options : undefined });
      if (!r.ok) {
        setErrors((r.data.errors as Errors) ?? {});
        setMessage(String(r.data.error ?? "Não foi possível criar o tópico."));
        return;
      }
      router.push(`/comunidades/${r.data.key}/topicos/${r.data.topicId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" data-testid="new-topic-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
        Novo tópico
      </Typography>
      <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} error={Boolean(errors.title)} helperText={errors.title} slotProps={{ htmlInput: { maxLength: 120, "data-testid": "new-topic-title" } }} />
      <TextField label="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={4} error={Boolean(errors.body)} helperText={errors.body} slotProps={{ htmlInput: { maxLength: 5000, "data-testid": "new-topic-body" } }} />
      {works.length > 1 && (
        <TextField select label="Sobre" value={about} onChange={(e) => setAbout(e.target.value)} error={Boolean(errors.catalogEntryId)} helperText={errors.catalogEntryId ?? "Opcional: de qual temporada, filme ou OVA o tópico fala."} slotProps={{ htmlInput: { "data-testid": "new-topic-about" } }}>
          <MenuItem value="">A franquia toda</MenuItem>
          {works.map((w) => (
            <MenuItem key={w.id} value={w.id}>
              {w.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <FormControlLabel control={<Checkbox checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />} label="Contém spoiler" data-testid="new-topic-spoiler" />
      <FormControlLabel control={<Checkbox checked={withPoll} onChange={(e) => setWithPoll(e.target.checked)} />} label="Incluir enquete" data-testid="new-topic-poll" />
      {withPoll && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="new-topic-poll-options">
          {options.map((o, i) => (
            <TextField key={i} size="small" label={`Opção ${i + 1}`} value={o} onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} slotProps={{ htmlInput: { maxLength: 80, "data-testid": `new-topic-option-${i}` } }} />
          ))}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" disabled={options.length >= 10} onClick={() => setOptions((cur) => [...cur, ""])}>
              + Opção
            </Button>
            <Button size="small" disabled={options.length <= 2} onClick={() => setOptions((cur) => cur.slice(0, -1))}>
              − Opção
            </Button>
          </Box>
          {errors.poll && <Typography sx={{ fontSize: 12, color: "error.main" }}>{errors.poll}</Typography>}
        </Box>
      )}
      {message && (
        <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
          {message}
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button type="submit" variant="contained" disabled={busy} data-testid="new-topic-submit">
          Publicar tópico
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
      </Box>
    </Box>
  );
}

/** Responder ao tópico. Depois de enviar, vai para a última página (onde a resposta aparece). */
export function ReplyForm({ topicId, topicHref }: { topicId: string; topicHref: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await send(`/api/communities/topics/${topicId}/replies`, "POST", { body, isSpoiler: spoiler });
      if (!r.ok) {
        setError(String(r.data.error ?? "Não foi possível responder."));
        return;
      }
      setBody("");
      setSpoiler(false);
      router.push(`${topicHref}?pagina=ultima#resposta-${r.data.replyId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box component="form" data-testid="reply-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField label="Sua resposta" value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={3} slotProps={{ htmlInput: { maxLength: 3000, "data-testid": "reply-body" } }} />
      <FormControlLabel control={<Checkbox checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />} label="Contém spoiler" />
      {error && (
        <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
          {error}
        </Typography>
      )}
      <Box>
        <Button type="submit" variant="contained" disabled={busy || !body.trim()} data-testid="reply-submit">
          Responder
        </Button>
      </Box>
    </Box>
  );
}

/** Enquete: quem é da comunidade e ainda não votou escolhe uma opção; o resultado aparece para todos. */
export function PollBox({ topicId, options, myVote, canVote }: { topicId: string; options: Array<{ id: string; label: string; votes: number }>; myVote: string | null; canVote: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  async function choose(optionId: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await send(`/api/communities/topics/${topicId}/vote`, "POST", { optionId });
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível votar."));
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box data-testid="poll" sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 2, border: 1, borderColor: "divider", borderRadius: "12px" }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Enquete · {total} {total === 1 ? "voto" : "votos"}</Typography>
      {options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <Box key={o.id} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }} data-testid={`poll-option-${o.id}`}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ fontSize: 14, fontWeight: myVote === o.id ? 700 : 400 }}>
                {o.label}
                {myVote === o.id ? " · seu voto" : ""}
              </Typography>
              {canVote && !myVote ? (
                <Button size="small" disabled={busy} onClick={() => void choose(o.id)} sx={ELEVATED_BUTTON_SX} data-testid={`poll-vote-${o.id}`}>
                  Votar
                </Button>
              ) : (
                <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                  {o.votes} · {pct}%
                </Typography>
              )}
            </Box>
            <LinearProgress variant="determinate" value={pct} aria-label={`${o.label}: ${pct}%`} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        );
      })}
      {!canVote && !myVote && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Entre na comunidade para votar.</Typography>}
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** Editar (só quem escreveu) e apagar (quem escreveu ou a moderação) um tópico ou uma resposta. */
export function ContentActions({ kind, id, canEdit, canDelete, initial, afterDeleteHref }: { kind: "topic" | "reply"; id: string; canEdit: boolean; canDelete: boolean; initial: { title?: string; body: string }; afterDeleteHref?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial.title ?? "");
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = kind === "topic" ? `/api/communities/topics/${id}` : `/api/communities/replies/${id}`;
  if (!canEdit && !canDelete) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await send(url, "PATCH", kind === "topic" ? { title, body } : { body });
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível salvar."));
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(kind === "topic" ? "Apagar este tópico? Ele some da comunidade." : "Apagar esta resposta?")) return;
    setBusy(true);
    try {
      const r = await send(url, "DELETE");
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível apagar."));
      else if (afterDeleteHref) router.push(afterDeleteHref);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {editing && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {kind === "topic" && <TextField size="small" label="Título" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 120, "data-testid": `${kind}-edit-title-${id}` } }} />}
          <TextField size="small" label="Texto" value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={3} slotProps={{ htmlInput: { "data-testid": `${kind}-edit-body-${id}` } }} />
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        {canEdit &&
          (editing ? (
            <>
              <Button size="small" onClick={() => void save()} disabled={busy} data-testid={`${kind}-save-${id}`}>
                Salvar
              </Button>
              <Button size="small" onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="small" onClick={() => setEditing(true)} data-testid={`${kind}-edit-${id}`}>
              Editar
            </Button>
          ))}
        {canDelete && !editing && (
          <Button size="small" color="error" onClick={() => void remove()} disabled={busy} data-testid={`${kind}-delete-${id}`}>
            Apagar
          </Button>
        )}
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
