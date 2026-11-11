"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { AdminPanel } from "@/components/admin/AdminUi";

type EventRow = { id: string; title: string; kind: string; startsAt: string; place: string | null; partner: string | null; going: number };
type VoteRow = { id: string; title: string; status: string; closesAt: string; options: number; ballots: number } | null;
type PoolRow = { id: string; title: string; status: string; closesAt: string; picks: number } | null;

const KINDS = [
  ["CONVENCAO", "Convenção"],
  ["CINEMA", "Cinema"],
  ["LIVE", "Live"],
  ["OUTRO", "Outro"],
] as const;
const SEASONS = [
  ["WINTER", "Inverno"],
  ["SPRING", "Primavera"],
  ["SUMMER", "Verão"],
  ["FALL", "Outono"],
] as const;

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error ?? "Não foi possível concluir." };
}

/** "datetime-local" (horário de quem preenche) → ISO. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/**
 * Admin → Eventos e votações (10/11/2026): os disparos da parte social ficam aqui (pensando em parcerias): a agenda de
 * eventos, o anime da semana e o bolão da temporada.
 */
export function AdminSocialPanels({ events, vote, pool, defaultSeason }: { events: EventRow[]; vote: VoteRow; pool: PoolRow; defaultSeason: { season: string; year: number } }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [event, setEvent] = useState({ title: "", kind: "CONVENCAO", startsAt: "", endsAt: "", place: "", url: "", partner: "", description: "" });
  const [days, setDays] = useState("3");
  const [poolForm, setPoolForm] = useState({ season: defaultSeason.season, seasonYear: String(defaultSeason.year), closesAt: "", picksPerUser: "5" });
  const [charForm, setCharForm] = useState({ season: defaultSeason.season, seasonYear: String(defaultSeason.year) });

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setMessage(null);
    const result = await action();
    setMessage(result.ok ? { kind: "success", text: success } : { kind: "error", text: result.error ?? "Falhou." });
    if (result.ok) router.refresh();
    return result.ok;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {message && (
        <Alert severity={message.kind} role="status" data-testid="admin-social-message">
          {message.text}
        </Alert>
      )}

      <AdminPanel title="Agenda de eventos" testId="admin-events">
        <Box
          component="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => send("/api/admin/events", "POST", { ...event, startsAt: toIso(event.startsAt), endsAt: toIso(event.endsAt) }), "Evento cadastrado.");
            if (ok) setEvent({ title: "", kind: "CONVENCAO", startsAt: "", endsAt: "", place: "", url: "", partner: "", description: "" });
          }}
          sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" }, gap: 2 }}
        >
          <TextField label="Nome do evento" required size="small" value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} />
          <TextField select label="Tipo" size="small" value={event.kind} onChange={(e) => setEvent({ ...event, kind: e.target.value })}>
            {KINDS.map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Começa" type="datetime-local" required size="small" value={event.startsAt} onChange={(e) => setEvent({ ...event, startsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Termina (opcional)" type="datetime-local" size="small" value={event.endsAt} onChange={(e) => setEvent({ ...event, endsAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Local" size="small" value={event.place} onChange={(e) => setEvent({ ...event, place: e.target.value })} />
          <TextField label="Link (https://…)" size="small" value={event.url} onChange={(e) => setEvent({ ...event, url: e.target.value })} />
          <TextField label="Parceria (opcional)" size="small" value={event.partner} onChange={(e) => setEvent({ ...event, partner: e.target.value })} />
          <TextField label="Descrição" size="small" multiline minRows={2} value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} />
          <Box>
            <Button type="submit" variant="contained">
              Cadastrar evento
            </Button>
          </Box>
        </Box>
        {events.length > 0 && (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
            {events.map((e) => (
              <Box component="li" key={e.id} data-testid="admin-event-row" sx={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", borderTop: 1, borderColor: "divider", pt: 1 }}>
                <Typography sx={{ fontSize: 14 }}>
                  <strong>{e.title}</strong> · <span suppressHydrationWarning>{new Date(e.startsAt).toLocaleString("pt-BR")}</span>
                  {e.place ? ` · ${e.place}` : ""} · {e.going} {e.going === 1 ? "vai" : "vão"}
                </Typography>
                <Button size="small" color="error" onClick={() => void run(() => send(`/api/admin/events/${e.id}`, "DELETE"), "Evento tirado da agenda.")}>
                  Tirar da agenda
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </AdminPanel>

      <AdminPanel title="Anime da semana" testId="admin-weekly-vote">
        {vote && vote.status === "OPEN" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography sx={{ fontSize: 14 }}>
              <strong>{vote.title}</strong> aberta: {vote.options} obras, {vote.ballots} {vote.ballots === 1 ? "voto" : "votos"}. Fecha em{" "}
              <span suppressHydrationWarning>{new Date(vote.closesAt).toLocaleString("pt-BR")}</span>.
            </Typography>
            <Box>
              <Button variant="contained" onClick={() => void run(() => send(`/api/admin/weekly-vote/${vote.id}/close`, "POST"), "Votação encerrada; o resultado foi publicado no Feed pelo NewsHub.")}>
                Encerrar e publicar o resultado
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 14, flex: "1 1 280px" }}>Entram as obras da plataforma que tiveram episódio nos últimos 7 dias (até 20, as mais populares primeiro).</Typography>
            <TextField select label="Aberta por" size="small" value={days} onChange={(e) => setDays(e.target.value)} sx={{ minWidth: 140 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <MenuItem key={d} value={String(d)}>
                  {d} {d === 1 ? "dia" : "dias"}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" onClick={() => void run(() => send("/api/admin/weekly-vote", "POST", { days: Number(days) }), "Votação aberta.")}>
              Abrir votação
            </Button>
          </Box>
        )}
      </AdminPanel>

      <AdminPanel title="Bolão da temporada" testId="admin-pool">
        {pool && pool.status !== "FINISHED" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography sx={{ fontSize: 14 }}>
              <strong>{pool.title}</strong>: {pool.picks} {pool.picks === 1 ? "escolha" : "escolhas"}. As escolhas fecham em <span suppressHydrationWarning>{new Date(pool.closesAt).toLocaleString("pt-BR")}</span>.
            </Typography>
            <Box>
              <Button variant="contained" onClick={() => void run(() => send(`/api/admin/pool/${pool.id}/finish`, "POST"), "Bolão encerrado: o placar ficou gravado.")}>
                Encerrar bolão
              </Button>
            </Box>
          </Box>
        ) : (
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => send("/api/admin/pool", "POST", { ...poolForm, seasonYear: Number(poolForm.seasonYear), picksPerUser: Number(poolForm.picksPerUser), closesAt: toIso(poolForm.closesAt) }), "Bolão aberto.");
            }}
            sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}
          >
            <TextField select label="Temporada" size="small" value={poolForm.season} onChange={(e) => setPoolForm({ ...poolForm, season: e.target.value })} sx={{ minWidth: 140 }}>
              {SEASONS.map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Ano" size="small" type="number" value={poolForm.seasonYear} onChange={(e) => setPoolForm({ ...poolForm, seasonYear: e.target.value })} sx={{ width: 110 }} />
            <TextField label="Escolhas até" type="datetime-local" required size="small" value={poolForm.closesAt} onChange={(e) => setPoolForm({ ...poolForm, closesAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Obras por pessoa" size="small" type="number" value={poolForm.picksPerUser} onChange={(e) => setPoolForm({ ...poolForm, picksPerUser: e.target.value })} sx={{ width: 150 }} />
            <Button type="submit" variant="contained">
              Abrir bolão
            </Button>
          </Box>
        )}
      </AdminPanel>

      <AdminPanel title="Personagem da temporada" testId="admin-season-character">
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          O mais favoritado entre os personagens das obras da temporada (o elenco precisa estar carregado em Elenco e aberturas). Sai no Feed pelo NewsHub; publicar de novo troca a publicação anterior.
        </Typography>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => send("/api/admin/season-character", "POST", { season: charForm.season, seasonYear: Number(charForm.seasonYear) }), "Personagem da temporada publicado no Feed.");
          }}
          sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}
        >
          <TextField select label="Temporada" size="small" value={charForm.season} onChange={(e) => setCharForm({ ...charForm, season: e.target.value })} sx={{ minWidth: 140 }}>
            {SEASONS.map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Ano" size="small" type="number" value={charForm.seasonYear} onChange={(e) => setCharForm({ ...charForm, seasonYear: e.target.value })} sx={{ width: 110 }} />
          <Button type="submit" variant="contained" data-testid="admin-season-character-publish">
            Publicar personagem da temporada
          </Button>
        </Box>
      </AdminPanel>
    </Box>
  );
}
