"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FavoriteIcon from "@mui/icons-material/Favorite";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

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
 * Amizade (como no Orkut): adicionar, cancelar o pedido, aceitar ou recusar o recebido, desfazer. Depois da mudança a
 * página é recarregada (depoimentos e avaliações dependem da amizade).
 */
export function FriendButton({ userId, initial, compact = false }: { userId: string; initial: FriendState; compact?: boolean }) {
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
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }} data-testid="friend-box" data-state={state}>
      {state === "none" && (
        <Button variant="contained" size={size} disabled={busy} onClick={() => act("PUT")} data-testid="friend-add">
          Adicionar como amigo
        </Button>
      )}
      {state === "sent" && (
        <>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Pedido de amizade enviado.</Typography>
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

/** "Ser fã" (como no Orkut) e a contagem de fãs. */
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
 * Avaliações (como o confiável/legal/sexy do Orkut, com o tema do Anime Hub): a média de quem avaliou e, para amigos,
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
export function ScrapForm({ userId }: { userId: string }) {
  const router = useRouter();
  return (
    <Composer
      label="Escreva um recado"
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
