"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FavoriteIcon from "@mui/icons-material/Favorite";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import NextLink from "next/link";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ReportDialog } from "@/components/ReportDialog";

type RatingKey = "otaku" | "gentil" | "semSpoiler";
type Ratings = Record<RatingKey, number>;
const RATINGS: Array<{ key: RatingKey; label: string; Icon: typeof FavoriteIcon }> = [
  { key: "otaku", label: "Otaku raiz", Icon: AutoAwesomeIcon },
  { key: "gentil", label: "Gente boa", Icon: FavoriteIcon },
  { key: "semSpoiler", label: "Sem spoiler", Icon: VerifiedUserIcon },
];

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const errorOf = (data: Record<string, unknown>) => (typeof data.error === "string" ? data.error : "Não foi possível salvar. Tente de novo.");

type FriendState = "none" | "friends" | "sent" | "received";

/**
 * Amizade: adicionar, cancelar o pedido, aceitar ou recusar o recebido, desfazer. Depois da mudança a
 * página é recarregada (depoimentos e avaliações dependem da amizade). `inline`: só botões, para a linha de ações do
 * cabeçalho do perfil (ao lado de "Seguir perfil").
 */
export function FriendButton({ userId, initial, compact = false, inline = false }: { userId: string; initial: FriendState; compact?: boolean; inline?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<FriendState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(method: "PUT" | "DELETE", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/users/${userId}/friend`, method);
    setBusy(false);
    if (!r.ok) return setError(errorOf(r.data));
    setState(r.data.state as FriendState);
    router.refresh();
  }
  const size = compact ? "small" : "medium";
  if (inline) {
    return (
      <>
        {state === "none" && (
          <Button variant="contained" disabled={busy} onClick={() => act("PUT")} data-testid="friend-add">
            Adicionar como amigo
          </Button>
        )}
        {state === "sent" && (
          <Button disabled={busy} onClick={() => act("DELETE")} sx={ELEVATED_BUTTON_SX} data-testid="friend-cancel" title="Pedido de amizade enviado">
            Pedido enviado · cancelar
          </Button>
        )}
        {state === "received" && (
          <>
            <Button variant="contained" disabled={busy} onClick={() => act("PUT")} data-testid="friend-accept">
              Aceitar amizade
            </Button>
            <Button disabled={busy} onClick={() => act("DELETE")} sx={ELEVATED_BUTTON_SX} data-testid="friend-decline">
              Recusar
            </Button>
          </>
        )}
        {state === "friends" && (
          <Button disabled={busy} onClick={() => act("DELETE", "Desfazer a amizade?")} sx={ELEVATED_BUTTON_SX} data-testid="friend-remove" title="Vocês são amigos. Clique para desfazer a amizade.">
            ✓ Amigos
          </Button>
        )}
        {error && (
          <Typography role="alert" sx={{ fontSize: 12, color: "error.main", alignSelf: "center" }}>
            {error}
          </Typography>
        )}
      </>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }} data-testid="friend-box" data-state={state}>
      {state === "none" && (
        <Button variant="contained" size={size} disabled={busy} onClick={() => act("PUT")} data-testid="friend-add">
          Adicionar como amigo
        </Button>
      )}
      {state === "sent" && (
        <>
          {!compact && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Pedido de amizade enviado.</Typography>}
          <Button size={size} disabled={busy} onClick={() => act("DELETE")} sx={ELEVATED_BUTTON_SX} data-testid="friend-cancel">
            Cancelar pedido
          </Button>
        </>
      )}
      {state === "received" && (
        <>
          {!compact && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Quer ser seu amigo.</Typography>}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" size={size} disabled={busy} onClick={() => act("PUT")} data-testid="friend-accept">
              Aceitar
            </Button>
            <Button size={size} disabled={busy} onClick={() => act("DELETE")} sx={ELEVATED_BUTTON_SX} data-testid="friend-decline">
              Recusar
            </Button>
          </Box>
        </>
      )}
      {state === "friends" && (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }} data-testid="friend-state">
            ✓ Vocês são amigos
          </Typography>
          <Button size="small" color="inherit" disabled={busy} onClick={() => act("DELETE", "Desfazer a amizade?")} sx={{ alignSelf: "flex-start", fontSize: 12, color: "text.secondary", px: 0, minWidth: 0 }} data-testid="friend-remove">
            Desfazer amizade
          </Button>
        </>
      )}
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** "Ser fã" e a contagem de fãs. */
export function FanButton({ userId, initialFan, initialFans, canFan }: { userId: string; initialFan: boolean; initialFans: number; canFan: boolean }) {
  const [fan, setFan] = useState(initialFan);
  const [fans, setFans] = useState(initialFans);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const r = await send(`/api/users/${userId}/fan`, "PATCH", { fan: !fan });
    setBusy(false);
    if (!r.ok) return;
    setFan(Boolean(r.data.fan));
    setFans(Number(r.data.fans));
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
      <Typography sx={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }} data-testid="profile-fan-count">
        {fans} {fans === 1 ? "fã" : "fãs"}
      </Typography>
      {canFan && (
        <Button size="small" onClick={toggle} disabled={busy} variant={fan ? "text" : "contained"} sx={fan ? ELEVATED_BUTTON_SX : undefined} aria-pressed={fan} data-testid="profile-fan-toggle">
          {fan ? "Deixar de ser fã" : "Ser fã"}
        </Button>
      )}
    </Box>
  );
}

function Pips({ value, Icon, label }: { value: number; Icon: typeof FavoriteIcon; label: string }) {
  return (
    <Box sx={{ display: "flex", gap: 0.25 }} role="img" aria-label={`${label}: ${value.toLocaleString("pt-BR")} de 3`}>
      {[1, 2, 3].map((n) => (
        <Icon key={n} sx={{ fontSize: 18, color: value >= n - 0.5 ? "primary.main" : "text.disabled" }} />
      ))}
    </Box>
  );
}

/**
 * Avaliações (com o tema do Anime Hub): a média de quem avaliou e, para amigos,
 * a própria avaliação (clicar no ícone marca até ele; clicar no último marcado volta um).
 */
export function RatingBox({ userId, initialAverage, initialVotes, initialMine, canRate }: { userId: string; initialAverage: Ratings; initialVotes: number; initialMine: Ratings | null; canRate: boolean }) {
  const [average, setAverage] = useState(initialAverage);
  const [votes, setVotes] = useState(initialVotes);
  const [mine, setMine] = useState<Ratings>(initialMine ?? { otaku: 0, gentil: 0, semSpoiler: 0 });
  const [error, setError] = useState<string | null>(null);
  async function rate(key: RatingKey, n: number) {
    const value = mine[key] === n ? n - 1 : n;
    setError(null);
    const r = await send(`/api/users/${userId}/rating`, "PUT", { [key]: value });
    if (!r.ok) return setError(errorOf(r.data));
    setMine((m) => ({ ...m, [key]: value }));
    setAverage(r.data.average as Ratings);
    setVotes(Number(r.data.votes));
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="profile-ratings">
      {RATINGS.map(({ key, label, Icon }) => (
        <Box key={key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }} data-testid={`profile-rating-${key}`} data-value={average[key]}>
          <Typography sx={{ fontSize: 13 }}>{label}</Typography>
          <Pips value={average[key]} Icon={Icon} label={label} />
        </Box>
      ))}
      <Typography sx={{ fontSize: 12, color: "text.secondary" }} data-testid="profile-rating-votes">
        {votes === 0 ? "Ninguém avaliou ainda." : `Média de ${votes} ${votes === 1 ? "amigo" : "amigos"}.`}
      </Typography>
      {canRate && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>Sua avaliação</Typography>
          {RATINGS.map(({ key, label, Icon }) => (
            <Box key={key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: 13 }}>{label}</Typography>
              <Box sx={{ display: "flex" }}>
                {[1, 2, 3].map((n) => (
                  <Box
                    key={n}
                    component="button"
                    type="button"
                    onClick={() => rate(key, n)}
                    aria-label={`${label}: ${n} de 3`}
                    aria-pressed={mine[key] >= n}
                    data-testid={`rate-${key}-${n}`}
                    sx={{ p: 0.25, border: 0, bgcolor: "transparent", cursor: "pointer", display: "flex", borderRadius: "4px", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
                  >
                    <Icon sx={{ fontSize: 20, color: mine[key] >= n ? "primary.main" : "text.disabled" }} />
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** Caixa de texto com o botão de enviar (recado e depoimento). */
function Composer({ label, placeholder, max, initial = "", submitLabel, onSubmit, testId }: { label: string; placeholder: string; max: number; initial?: string; submitLabel: string; onSubmit: (text: string) => Promise<string | null>; testId: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSubmit(text);
    setBusy(false);
    if (err) setError(err);
    else if (!initial) setText("");
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <TextField
        label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={2}
        size="small"
        error={Boolean(error)}
        helperText={error ?? `${text.length}/${max.toLocaleString("pt-BR")}`}
        slotProps={{ htmlInput: { maxLength: max, "data-testid": `${testId}-input` } }}
      />
      <Box>
        <Button variant="contained" size="small" onClick={submit} disabled={busy || text.trim().length === 0} data-testid={`${testId}-send`}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

/** Deixar um recado no perfil. */
export function ScrapForm({ userId, label = "Escreva um recado" }: { userId: string; label?: string }) {
  const router = useRouter();
  return (
    <Composer
      label={label}
      placeholder="Oi! Viu o episódio de hoje?"
      max={1000}
      submitLabel="Enviar recado"
      testId="scrap"
      onSubmit={async (body) => {
        const r = await send(`/api/users/${userId}/scraps`, "POST", { body });
        if (!r.ok) return errorOf(r.data);
        router.refresh();
        return null;
      }}
    />
  );
}

const STATUS_TEXT: Record<string, string> = { PENDING: "Esperando a aprovação.", APPROVED: "Aprovado e visível no perfil.", REJECTED: "Não foi aprovado. Você pode reescrever." };

/** Escrever (ou reescrever) o depoimento para um amigo; reescrever volta a esperar a aprovação. */
export function TestimonialForm({ userId, displayName, initial, status }: { userId: string; displayName: string; initial: string; status: string | null }) {
  const router = useRouter();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="testimonial-form">
      {status && (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }} data-testid="testimonial-status">
          Seu depoimento: {STATUS_TEXT[status] ?? status}
        </Typography>
      )}
      <Composer
        label={`Depoimento para ${displayName}`}
        placeholder="Conte o que torna essa pessoa uma ótima companhia de maratona."
        max={2000}
        initial={initial}
        submitLabel={initial ? "Reescrever depoimento" : "Enviar depoimento"}
        testId="testimonial"
        onSubmit={async (body) => {
          const r = await send(`/api/users/${userId}/testimonials`, "PUT", { body });
          if (!r.ok) return errorOf(r.data);
          router.refresh();
          return null;
        }}
      />
    </Box>
  );
}

/** Aprovar ou recusar um depoimento recebido. */
export function TestimonialDecision({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function decide(approve: boolean) {
    setBusy(true);
    const r = await send(`/api/testimonials/${id}`, "PATCH", { approve });
    setBusy(false);
    if (r.ok) router.refresh();
  }
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Button size="small" variant="contained" disabled={busy} onClick={() => decide(true)} data-testid={`testimonial-approve-${id}`}>
        Aprovar
      </Button>
      <Button size="small" disabled={busy} onClick={() => decide(false)} sx={ELEVATED_BUTTON_SX} data-testid={`testimonial-reject-${id}`}>
        Recusar
      </Button>
    </Box>
  );
}

/** Apagar (recado ou depoimento). */
export function DeleteButton({ url, testId, label = "Apagar" }: { url: string; testId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const r = await send(url, "DELETE");
    setBusy(false);
    if (r.ok) router.refresh();
  }
  return (
    <Button size="small" color="inherit" disabled={busy} onClick={remove} sx={{ fontSize: 12, color: "text.secondary", minWidth: 0 }} data-testid={testId}>
      {label}
    </Button>
  );
}

/** "Denunciar" um recado, um depoimento ou um álbum (motivo fixo e confirmação, como nas publicações). */
export function ProfileReportButton({ kind, id }: { kind: "scrap" | "testimonial" | "album"; id: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <Typography sx={{ fontSize: 12, color: "text.secondary" }} data-testid={`reported-${kind}-${id}`}>
        Denunciado
      </Typography>
    );
  return (
    <>
      <Button size="small" color="inherit" onClick={() => setOpen(true)} sx={{ fontSize: 12, color: "text.secondary", minWidth: 0 }} data-testid={`report-${kind}-${id}`}>
        Denunciar
      </Button>
      <ReportDialog open={open} onClose={() => setOpen(false)} target={{ kind, id }} targetLabel={kind === "scrap" ? "recado" : kind === "testimonial" ? "depoimento" : "álbum"} onReported={() => setDone(true)} />
    </>
  );
}

export type ProfileReportView = { id: string; kind: "scrap" | "testimonial" | "album"; reason: string; reporter: string; author: string; profile: string; body: string; removed: boolean; href: string };

/** Fila de denúncias de recados e depoimentos (Admin → Acesso e moderação): remover o conteúdo ou mantê-lo. */
export function ProfileReportsQueue({ reports }: { reports: ProfileReportView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function resolve(id: string, action: "remove" | "keep") {
    setBusy(id);
    try {
      const r = await send(`/api/admin/profile-reports/${id}`, "POST", { action });
      if (r.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }
  if (reports.length === 0)
    return (
      <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="profile-reports-empty">
        Nenhuma denúncia aberta nos perfis.
      </Typography>
    );
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="profile-reports">
      {reports.map((r) => (
        <Box component="li" key={r.id} data-testid={`profile-report-${r.id}`} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px", display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {r.kind === "scrap" ? "Recado" : r.kind === "testimonial" ? "Depoimento" : "Álbum"} de {r.author} no perfil de{" "}
            <NextLink href={r.href} style={{ color: "inherit" }}>
              {r.profile}
            </NextLink>{" "}
            · denunciado por {r.reporter}
          </Typography>
          <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body.slice(0, 400)}</Typography>
          <Typography sx={{ fontSize: 13 }}>Motivo: {r.reason}</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" color="error" variant="outlined" disabled={busy === r.id || r.removed} onClick={() => void resolve(r.id, "remove")} data-testid={`profile-report-remove-${r.id}`}>
              {r.removed ? "Já removido" : "Remover"}
            </Button>
            <Button size="small" disabled={busy === r.id} onClick={() => void resolve(r.id, "keep")} data-testid={`profile-report-keep-${r.id}`}>
              Manter
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** "Responder" um recado recebido: a resposta vai para o perfil de quem escreveu. */
export function ScrapReplyButton({ scrapId, authorId, authorName }: { scrapId: string; authorId: string; authorName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <Typography sx={{ fontSize: 12, color: "text.secondary" }} data-testid={`scrap-replied-${scrapId}`}>
        Resposta enviada
      </Typography>
    );
  return (
    <>
      <Button size="small" color="inherit" onClick={() => setOpen(true)} sx={{ fontSize: 12, color: "text.secondary", minWidth: 0 }} data-testid={`scrap-reply-${scrapId}`}>
        Responder
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Responder a {authorName}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>A resposta fica no perfil de {authorName}, como um recado.</Typography>
          <Composer
            label="Sua resposta"
            placeholder="Escreva a resposta"
            max={1000}
            submitLabel="Enviar resposta"
            testId="scrap-reply"
            onSubmit={async (body) => {
              const r = await send(`/api/users/${authorId}/scraps`, "POST", { body, replyToId: scrapId });
              if (!r.ok) return errorOf(r.data);
              setOpen(false);
              setSent(true);
              router.refresh();
              return null;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
