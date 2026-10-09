"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { Header } from "@/components/Header";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";
import { useTitlePreference } from "@/lib/titlePreference";
import { loginHref } from "@/lib/safeRedirect";
import { DEVICE_TIME_ZONE, TIME_ZONE_OPTIONS, DEFAULT_TIME_ZONE } from "@/lib/timeZone";
import { SOCIAL_OFF_PATCH, type UserPreferences } from "@/lib/userSettings";

/**
 * Configurações (Figma `8:3333` e `13:42966`): formato dos títulos, fuso,
 * tema e notificações dos dois canais (Lançamentos × Social). Salvar
 * desabilita a ação; falha mantém os valores e oferece tentar de novo,
 * sem mostrar sucesso (`8:5448`, `8:5542`).
 */
type Draft = Pick<
  UserPreferences,
  "notifyReleases" | "notifyReplies" | "notifyComments" | "notifyFollowers" | "notifyLikes"
> & { titleFormat: "ja" | "romaji"; timeZone: string };

const SOCIAL_TOGGLES: Array<{ key: keyof Draft; label: string; hint: string }> = [
  { key: "notifyReplies", label: "Respostas às minhas publicações", hint: "Avisos sem trecho sensível. Padrão ativado." },
  { key: "notifyComments", label: "Respostas aos meus comentários", hint: "Abrir a resposta exata na discussão. Padrão ativado." },
  { key: "notifyFollowers", label: "Novos seguidores", hint: "Padrão ativado; seguir perfil não acompanha anime." },
  { key: "notifyLikes", label: "Curtidas", hint: "Padrão desativado para reduzir ruído." },
];

export default function SettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const setUser = useSetCurrentUser();
  const { clearLocalPreference } = useTitlePreference();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (user === null) router.replace(loginHref("/configuracoes"));
  }, [user, router]);

  // Inicializa o rascunho uma vez, quando a conta chega.
  useEffect(() => {
    if (user && !draft) {
      const p = user.preferences;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({
        titleFormat: p.titleFormat ?? "ja",
        timeZone: p.timeZone ?? DEFAULT_TIME_ZONE,
        notifyReleases: p.notifyReleases,
        notifyReplies: p.notifyReplies,
        notifyComments: p.notifyComments,
        notifyFollowers: p.notifyFollowers,
        notifyLikes: p.notifyLikes,
      });
    }
  }, [user, draft]);

  if (!user || !draft) return null;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setStatus("idle");
  }

  async function save() {
    if (!draft) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("falha");
      const data = await res.json();
      if (user) setUser({ ...user, preferences: data.preferences });
      // A escolha da conta passa a valer: esquece o override local do menu.
      clearLocalPreference();
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const allSocialOff = !draft.notifyReplies && !draft.notifyComments && !draft.notifyFollowers && !draft.notifyLikes;

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <Box sx={{ px: { xs: 3, sm: 5 }, py: 4, maxWidth: 760 }}>
        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 1 }}>
          設定 / PREFERÊNCIAS
        </Typography>
        <Typography variant="h3" component="h1" className="font-display" sx={{ textTransform: "uppercase" }}>
          Configurações
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          Seu tempo, seus títulos e suas conversas, do seu jeito.
        </Typography>

        <Stack spacing={4} sx={{ mt: 4 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Formato dos títulos
            </FormLabel>
            <RadioGroup
              value={draft.titleFormat}
              onChange={(e) => update("titleFormat", e.target.value as Draft["titleFormat"])}
              name="titleFormat"
            >
              <FormControlLabel value="ja" control={<Radio />} label="Japonês (kanji+kana+inglês)" />
              <FormControlLabel value="romaji" control={<Radio />} label="Romaji (romaji+inglês)" />
            </RadioGroup>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Muda a apresentação dos títulos, não o idioma da interface. Kana é a leitura em kana.
            </Typography>
          </FormControl>

          <FormControl>
            <FormLabel id="tz-label" sx={{ mb: 1 }}>
              Timezone
            </FormLabel>
            <Select
              labelId="tz-label"
              value={draft.timeZone}
              onChange={(e) => update("timeZone", e.target.value)}
              size="small"
              sx={{ maxWidth: 360 }}
              data-testid="timezone-select"
            >
              <MenuItem value={DEVICE_TIME_ZONE}>Usar o fuso do dispositivo</MenuItem>
              {TIME_ZONE_OPTIONS.map((zone) => (
                <MenuItem key={zone} value={zone}>
                  {zone}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Tema
            </Typography>
            <Chip label="Dark" size="small" />
          </Box>

          <Box component="section" aria-labelledby="notif-launch">
            <Typography id="notif-launch" variant="h6" component="h2" sx={{ mb: 1 }}>
              Notificações · Lançamentos
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.notifyReleases}
                  onChange={(e) => update("notifyReleases", e.target.checked)}
                  slotProps={{ input: { "aria-label": "Novos episódios e datas alteradas" } }}
                />
              }
              label="Novos episódios e datas alteradas"
            />
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              Somente dos animes que você acompanha.
            </Typography>
          </Box>

          <Box component="section" aria-labelledby="notif-social">
            <Typography id="notif-social" variant="h6" component="h2" sx={{ mb: 1 }}>
              Notificações · Social
            </Typography>
            <Stack spacing={1.5}>
              {SOCIAL_TOGGLES.map(({ key, label, hint }) => (
                <Box key={key}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(draft[key])}
                        onChange={(e) => update(key, e.target.checked as never)}
                        slotProps={{ input: { "aria-label": label } }}
                      />
                    }
                    label={label}
                  />
                  <Typography variant="caption" sx={{ display: "block", color: "text.secondary", ml: 6 }}>
                    {hint}
                  </Typography>
                </Box>
              ))}
            </Stack>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              sx={{ mt: 2 }}
              disabled={allSocialOff}
              onClick={() => setDraft((d) => (d ? { ...d, ...(SOCIAL_OFF_PATCH as Partial<Draft>) } : d))}
            >
              Desativar todo o Social
            </Button>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 1 }}>
              Desativar todas as notificações sociais não altera “Novos episódios e datas alteradas”. Os canais continuam separados.
            </Typography>
          </Box>

          {status === "saved" && (
            <Alert severity="success" role="status">
              Configurações salvas. Preferências sociais atualizadas; lançamentos preservados.
            </Alert>
          )}
          {status === "error" && (
            <Alert severity="error" role="alert">
              Não foi possível salvar as configurações. Suas escolhas foram mantidas. Tente salvar novamente.
            </Alert>
          )}

          <Box>
            <Button variant="contained" onClick={save} disabled={status === "saving"} data-testid="save-settings">
              {status === "saving" ? "Salvando…" : status === "error" ? "Salvar novamente" : "Salvar configurações"}
            </Button>
          </Box>
        </Stack>
      </Box>
    </div>
  );
}
