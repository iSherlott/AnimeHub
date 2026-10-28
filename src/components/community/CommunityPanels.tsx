"use client";

import { useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import { SpoilerText } from "@/components/community/CommunityClient";
import { spoilerLabel } from "@/lib/spoilers";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { useTimeZone } from "@/lib/useTimeZone";
import { formatTimeInZone, timeZoneLabel, zonedLocalToUtc } from "@/lib/timeZone";

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

/** Menu da coluna da esquerda: Início, Fórum, Enquetes, Eventos, Membros. */
export function CommunityMenu({ communityKey, counts }: { communityKey: string; counts: { topics: number; polls: number; events: number; members: number } }) {
  const pathname = usePathname();
  const base = `/comunidades/${communityKey}`;
  const items = [
    { href: base, label: "Início", count: null, match: (p: string) => p === base },
    { href: `${base}/forum`, label: "Fórum", count: counts.topics, match: (p: string) => p.startsWith(`${base}/forum`) || p.startsWith(`${base}/topicos`) },
    { href: `${base}/enquetes`, label: "Enquetes", count: counts.polls, match: (p: string) => p.startsWith(`${base}/enquetes`) },
    { href: `${base}/eventos`, label: "Eventos", count: counts.events, match: (p: string) => p.startsWith(`${base}/eventos`) },
    { href: `${base}/membros`, label: "Membros", count: counts.members, match: (p: string) => p.startsWith(`${base}/membros`) },
  ];
  return (
    <Box component="nav" aria-label="Seções da comunidade" sx={{ display: "flex", flexDirection: { xs: "row", md: "column" }, flexWrap: "wrap", gap: 0.5 }} data-testid="community-menu">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Box
            key={item.href}
            component={NextLink}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-testid={`community-menu-${item.label.toLowerCase()}`}
            sx={{ display: "flex", justifyContent: "space-between", gap: 1, px: 1.5, py: 0.75, borderRadius: "8px", fontSize: 14, textDecoration: "none", color: active ? "text.primary" : "text.secondary", bgcolor: active ? "#2c111b" : "transparent", fontWeight: active ? 700 : 400, "&:hover": { bgcolor: active ? "#2c111b" : "#171820", color: "text.primary" } }}
          >
            <span>{item.label}</span>
            {item.count !== null && <span style={{ fontVariantNumeric: "tabular-nums" }}>{item.count}</span>}
          </Box>
        );
      })}
    </Box>
  );
}

/** Editar a descrição da comunidade (moderação). Vazio volta à sinopse da obra principal. */
export function DescriptionEditor({ communityKey, initial }: { communityKey: string; initial: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await send(`/api/communities/${communityKey}/description`, "POST", { description: text });
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível salvar."));
      else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} data-testid="community-description-edit">
        Editar descrição
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Descrição da comunidade</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={5} value={text} onChange={(e) => setText(e.target.value)} helperText={error ?? "Vazio: usa a sinopse da obra principal."} error={Boolean(error)} slotProps={{ htmlInput: { maxLength: 2000, "data-testid": "community-description-input" } }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={busy} variant="contained" data-testid="community-description-save">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Fixar e trancar o tópico (moderação). */
export function ModerationButtons({ topicId, pinned, locked }: { topicId: string; pinned: boolean; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: "pin" | "unpin" | "lock" | "unlock") {
    setBusy(true);
    try {
      const r = await send(`/api/communities/topics/${topicId}/moderate`, "POST", { action });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} data-testid="topic-moderation">
      <Button size="small" disabled={busy} onClick={() => void act(pinned ? "unpin" : "pin")} sx={ELEVATED_BUTTON_SX} data-testid="topic-pin">
        {pinned ? "Desafixar" : "Fixar no topo"}
      </Button>
      <Button size="small" disabled={busy} onClick={() => void act(locked ? "unlock" : "lock")} sx={ELEVATED_BUTTON_SX} data-testid="topic-lock">
        {locked ? "Destrancar" : "Trancar tópico"}
      </Button>
    </Box>
  );
}

/** Denunciar um tópico, uma resposta ou um evento: o motivo vai para a fila de Acesso e moderação. */
export function ReportButton({ topicId, replyId, eventId }: { topicId?: string; replyId?: string; eventId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = topicId ?? replyId ?? eventId;
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await send("/api/communities/reports", "POST", { topicId, replyId, eventId, reason });
      if (!r.ok) setError(String(r.data.error ?? "Não foi possível denunciar."));
      else {
        setDone(true);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }
  if (done) return <Typography sx={{ fontSize: 12, color: "text.secondary" }} data-testid={`reported-${id}`}>Denúncia enviada à moderação.</Typography>;
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} sx={{ color: "text.secondary" }} data-testid={`report-${id}`}>
        Denunciar
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Denunciar {topicId ? "tópico" : replyId ? "resposta" : "evento"}</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={3} label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} helperText={error ?? "Ofensa, spam, spoiler sem aviso…"} error={Boolean(error)} slotProps={{ htmlInput: { maxLength: 300, "data-testid": "report-reason" } }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={busy || !reason.trim()} variant="contained" data-testid="report-submit">
            Enviar denúncia
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Novo evento: título, descrição, início e fim no fuso de quem cria (vão como instante) e onde. */
export function NewEventForm({ communityKey }: { communityKey: string }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", start: "", end: "", place: "" });
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (!open) {
    return (
      <Box>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="new-event-open">
          + Novo evento
        </Button>
      </Box>
    );
  }
  async function submit() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const startsAt = zonedLocalToUtc(form.start, timeZone);
      const endsAt = form.end ? zonedLocalToUtc(form.end, timeZone) : null;
      const r = await send(`/api/communities/${communityKey}/events`, "POST", { title: form.title, description: form.description, isSpoiler: spoiler, place: form.place, startsAt: startsAt?.toISOString() ?? "", endsAt: endsAt?.toISOString() ?? undefined });
      if (!r.ok) {
        setErrors((r.data.errors as Record<string, string>) ?? {});
        setMessage(String(r.data.error ?? "Não foi possível criar o evento."));
        return;
      }
      setOpen(false);
      setForm({ title: "", description: "", start: "", end: "", place: "" });
      setSpoiler(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box component="form" data-testid="new-event-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
        Novo evento
      </Typography>
      <TextField label="Título" value={form.title} onChange={(e) => set("title", e.target.value)} error={Boolean(errors.title)} helperText={errors.title ?? "Ex.: maratona da 1ª temporada, estreia do filme"} slotProps={{ htmlInput: { maxLength: 120, "data-testid": "new-event-title" } }} />
      <TextField label="Descrição" value={form.description} onChange={(e) => set("description", e.target.value)} multiline minRows={3} error={Boolean(errors.description)} helperText={errors.description} slotProps={{ htmlInput: { maxLength: 2000, "data-testid": "new-event-description" } }} />
      <FormControlLabel control={<Checkbox checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />} label="A descrição contém spoiler" data-testid="new-event-spoiler" />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField type="datetime-local" label={`Início (${timeZoneLabel(timeZone)})`} value={form.start} onChange={(e) => set("start", e.target.value)} error={Boolean(errors.startsAt)} helperText={errors.startsAt} sx={{ flex: "1 1 220px" }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "new-event-start" } }} />
        <TextField type="datetime-local" label="Fim (opcional)" value={form.end} onChange={(e) => set("end", e.target.value)} error={Boolean(errors.endsAt)} helperText={errors.endsAt} sx={{ flex: "1 1 220px" }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "new-event-end" } }} />
      </Box>
      <TextField label="Onde (opcional)" value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="Sala, link da transmissão…" error={Boolean(errors.place)} helperText={errors.place} slotProps={{ htmlInput: { maxLength: 200, "data-testid": "new-event-place" } }} />
      {message && (
        <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
          {message}
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button type="submit" variant="contained" disabled={busy} data-testid="new-event-submit">
          Criar evento
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
      </Box>
    </Box>
  );
}

export type EventView = { id: string; title: string; description: string; isSpoiler?: boolean; startsAt: string; endsAt: string | null; place: string | null; author: { id: string; displayName: string }; going: number; maybe: number; mine: string | null };

/** Um evento: quando (no fuso de quem vê), onde, quem vai e os botões de presença. */
export function EventCard({ event, canRsvp, canDelete, canReport = false, spoilerWork = null }: { event: EventView; canRsvp: boolean; canDelete: boolean; canReport?: boolean; /** O anime da comunidade, para o aviso de spoiler da descrição. */ spoilerWork?: string | null }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [busy, setBusy] = useState(false);
  const day = (iso: string) => `${new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso))} · ${formatTimeInZone(new Date(iso), timeZone)}`;
  // Começa e termina no mesmo dia (no fuso de quem vê): o fim mostra só o horário.
  const civil = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const sameDay = (a: string, b: string) => civil(a) === civil(b);
  async function act(status: "GOING" | "MAYBE" | null) {
    setBusy(true);
    try {
      const r = await send(`/api/communities/events/${event.id}`, "POST", { status });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm("Apagar este evento?")) return;
    setBusy(true);
    try {
      const r = await send(`/api/communities/events/${event.id}`, "DELETE");
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box component="li" id={`evento-${event.id}`} data-testid={`event-${event.id}`} sx={{ scrollMarginTop: 120, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75, p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px", bgcolor: "background.paper" }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>{event.title}</Typography>
      <Typography suppressHydrationWarning sx={{ fontSize: 13, color: "primary.light" }}>
        {day(event.startsAt)}
        {event.endsAt ? (sameDay(event.startsAt, event.endsAt) ? ` às ${formatTimeInZone(new Date(event.endsAt), timeZone)}` : ` até ${day(event.endsAt)}`) : ""}
      </Typography>
      {event.place && <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>Onde: {event.place}</Typography>}
      {/* A descrição pode contar um ponto da história: marcada como spoiler, fica coberta até tocar. */}
      <SpoilerText text={event.description} isSpoiler={Boolean(event.isSpoiler)} testId={`event-description-${event.id}`} label={spoilerLabel({ work: spoilerWork })} />
      <Typography sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }} data-testid={`event-count-${event.id}`}>
        {event.going} {event.going === 1 ? "vai" : "vão"} · {event.maybe} talvez · criado por {event.author.displayName}
      </Typography>
      {(canRsvp || canDelete || canReport) && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {canRsvp && (
            <>
              <Button size="small" disabled={busy} variant={event.mine === "GOING" ? "contained" : "outlined"} onClick={() => void act(event.mine === "GOING" ? null : "GOING")} data-testid={`event-going-${event.id}`}>
                Vou
              </Button>
              <Button size="small" disabled={busy} variant={event.mine === "MAYBE" ? "contained" : "outlined"} onClick={() => void act(event.mine === "MAYBE" ? null : "MAYBE")} data-testid={`event-maybe-${event.id}`}>
                Talvez
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="small" color="error" disabled={busy} onClick={() => void remove()} data-testid={`event-delete-${event.id}`}>
              Apagar
            </Button>
          )}
          {canReport && <ReportButton eventId={event.id} />}
        </Box>
      )}
    </Box>
  );
}

export type ReportView = { id: string; kind: "topic" | "reply" | "event"; reason: string; reporter: string; author: string; title: string; body: string; removed: boolean; href: string | null; community: string };

/** Fila de denúncias das comunidades (Admin → Acesso e moderação): remover o conteúdo ou mantê-lo. */
export function CommunityReportsQueue({ reports }: { reports: ReportView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function resolve(id: string, action: "remove" | "keep") {
    setBusy(id);
    try {
      const r = await send(`/api/admin/community-reports/${id}`, "POST", { action });
      if (r.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }
  if (reports.length === 0) return <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-reports-empty">Nenhuma denúncia aberta nas comunidades.</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="community-reports">
      {reports.map((r) => (
        <Box component="li" key={r.id} data-testid={`community-report-${r.id}`} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px", display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {r.kind === "topic" ? "Tópico" : r.kind === "reply" ? "Resposta" : "Evento"} de {r.author} · comunidade {r.community} · denunciado por {r.reporter}
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
            {r.href ? (
              <NextLink href={r.href} style={{ color: "inherit" }}>
                {r.title}
              </NextLink>
            ) : (
              r.title
            )}
          </Typography>
          <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body.slice(0, 400)}</Typography>
          <Typography sx={{ fontSize: 13 }}>Motivo: {r.reason}</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" color="error" variant="outlined" disabled={busy === r.id || r.removed} onClick={() => void resolve(r.id, "remove")} data-testid={`community-report-remove-${r.id}`}>
              {r.removed ? "Já removido" : "Remover"}
            </Button>
            <Button size="small" disabled={busy === r.id} onClick={() => void resolve(r.id, "keep")} data-testid={`community-report-keep-${r.id}`}>
              Manter
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
