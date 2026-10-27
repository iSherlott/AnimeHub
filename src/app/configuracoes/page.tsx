"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { Alert, Box, Button, MenuItem, Select, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
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
  "notifyReleases" | "notifyReplies" | "notifyComments" | "notifyFollowers" | "notifyLikes" | "notifyCommunity" | "animeListPublic" | "recordVisits"
> & { titleFormat: "ja" | "romaji"; synopsisLanguage: "pt" | "ja"; timeZone: string };

const SOCIAL_TOGGLES: Array<{ key: keyof Draft; label: string; hint: string }> = [
  { key: "notifyReplies", label: "Respostas às minhas publicações", hint: "Quando alguém responde a uma publicação sua. Vem ativado." },
  { key: "notifyComments", label: "Respostas aos meus comentários e recados", hint: "Respostas aos seus comentários, recados e depoimentos no seu perfil. Vem ativado." },
  { key: "notifyFollowers", label: "Seguidores, amizade e fãs", hint: "Novos seguidores, pedidos de amizade aceitos ou recebidos, novos fãs e aniversários dos amigos. Vem ativado." },
  { key: "notifyLikes", label: "Curtidas", hint: "Vem desativado, para não encher o sino." },
  { key: "notifyCommunity", label: "Comunidades", hint: "Respostas nos tópicos em que você participa e eventos novos nas suas comunidades. Vem ativado." },
];

/** Cartão do Figma: surface, raio 16, respiro de 24 e título de 20 px. */
function Card({ title, children, labelledBy }: { title: string; children: ReactNode; labelledBy?: string }) {
  return (
    <Box
      component="section"
      aria-labelledby={labelledBy}
      sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Typography id={labelledBy} component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const hiddenInput = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  m: 0,
} as const;

/** Opção de título: pílula com o círculo ◉/○ — acento quando selecionada, "elevated" quando não. */
function TitleOption({ name = "titleFormat", value, current, label, onSelect }: { name?: string; value: string; current: string; label: string; onSelect: () => void }) {
  const selected = value === current;
  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-flex",
        alignSelf: "flex-start",
        alignItems: "center",
        gap: 1,
        minHeight: 44,
        px: 2,
        py: 1.5,
        borderRadius: "10px",
        fontSize: 14,
        fontWeight: 700,
        bgcolor: selected ? "primary.main" : "#171820",
        color: selected ? "primary.contrastText" : "text.primary",
        "&:focus-within": { outline: "2px solid #ffd400", outlineOffset: 2 },
      }}
    >
      <input type="radio" name={name} value={value} checked={selected} onChange={onSelect} aria-label={label} style={hiddenInput as React.CSSProperties} />
      <span aria-hidden>{selected ? "◉" : "○"}</span>
      <span aria-hidden>{label}</span>
    </Box>
  );
}

/** Alternância "✓ Ativado" / "○ Desativado" do Figma, sobre um checkbox nativo (rótulo acessível = `label`). */
function PillToggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pb: 2, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography aria-hidden sx={{ fontSize: 16 }}>
          {label}
        </Typography>
        <Box
          sx={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 44,
            px: 2,
            borderRadius: "10px",
            bgcolor: "#171820",
            fontSize: 14,
            fontWeight: 700,
            "&:focus-within": { outline: "2px solid #ffd400", outlineOffset: 2 },
          }}
        >
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} style={hiddenInput as React.CSSProperties} />
          <span aria-hidden>{checked ? "✓" : "○"}</span>
          <span aria-hidden>{checked ? "Ativado" : "Desativado"}</span>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{hint}</Typography>
    </Box>
  );
}

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
        synopsisLanguage: p.synopsisLanguage ?? "pt",
        timeZone: p.timeZone ?? DEFAULT_TIME_ZONE,
        notifyReleases: p.notifyReleases,
        notifyReplies: p.notifyReplies,
        notifyComments: p.notifyComments,
        notifyFollowers: p.notifyFollowers,
        notifyLikes: p.notifyLikes,
        notifyCommunity: p.notifyCommunity,
        animeListPublic: p.animeListPublic,
        recordVisits: p.recordVisits,
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

  const allSocialOff = !draft.notifyReplies && !draft.notifyComments && !draft.notifyFollowers && !draft.notifyLikes && !draft.notifyCommunity;
  const japanese = draft.titleFormat === "ja";

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="設定 / PREFERÊNCIAS" title="Configurações" subtitle="Seu tempo, seus títulos e suas conversas, do seu jeito." />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1.17fr) minmax(0,1fr)" }, columnGap: 5, rowGap: 3, alignItems: "start" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Card title="Formato dos títulos" labelledBy="titles-heading">
              <Box role="radiogroup" aria-labelledby="titles-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TitleOption value="ja" current={draft.titleFormat} label="Japonês (kanji+kana+inglês)" onSelect={() => update("titleFormat", "ja")} />
                <TitleOption value="romaji" current={draft.titleFormat} label="Romaji (romaji+inglês)" onSelect={() => update("titleFormat", "romaji")} />
              </Box>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Muda a apresentação dos títulos, não o idioma da interface. Kana é a leitura em kana.
              </Typography>
            </Card>

            <Card title="Idioma da sinopse" labelledBy="synopsis-heading">
              <Box role="radiogroup" aria-labelledby="synopsis-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TitleOption name="synopsisLanguage" value="pt" current={draft.synopsisLanguage} label="Português" onSelect={() => update("synopsisLanguage", "pt")} />
                <TitleOption name="synopsisLanguage" value="ja" current={draft.synopsisLanguage} label="日本語 (japonês)" onSelect={() => update("synopsisLanguage", "ja")} />
              </Box>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Vale quando os títulos estão em japonês. Em português ou inglês, a sinopse segue o idioma dos títulos.
              </Typography>
            </Card>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography id="tz-label" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
                Fuso horário
              </Typography>
              <Select
                labelId="tz-label"
                value={draft.timeZone}
                onChange={(e) => update("timeZone", e.target.value)}
                data-testid="timezone-select"
                sx={{ bgcolor: "background.paper", fontSize: 14, "& .MuiSelect-select": { py: 2 }, "& fieldset": { borderColor: "divider" } }}
              >
                <MenuItem value={DEVICE_TIME_ZONE}>Usar o fuso do dispositivo</MenuItem>
                {TIME_ZONE_OPTIONS.map((zone) => (
                  <MenuItem key={zone} value={zone}>
                    {zone}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Card title="Tema">
              <Typography sx={{ fontSize: 14 }}>Escuro</Typography>
            </Card>

            <Card title="Notificações / Lançamentos" labelledBy="notif-launch">
              <PillToggle
                label="Novos episódios e datas alteradas"
                hint="Somente dos animes que você acompanha."
                checked={draft.notifyReleases}
                onChange={(v) => update("notifyReleases", v)}
              />
            </Card>

            <Card title="Notificações / Social" labelledBy="notif-social">
              {SOCIAL_TOGGLES.map(({ key, label, hint }) => (
                <PillToggle key={key} label={label} hint={hint} checked={Boolean(draft[key])} onChange={(v) => update(key, v as never)} />
              ))}
            </Card>

            <Box>
              <Button variant="contained" onClick={save} disabled={status === "saving"} data-testid="save-settings">
                {status === "saving" ? "Salvando…" : status === "error" ? "Salvar novamente" : "Salvar configurações"}
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Card title={`PREVIEW · ${japanese ? "Japonês" : "Romaji"} selecionado`}>
              <Typography lang={japanese ? "ja" : undefined} sx={{ fontSize: 20, fontWeight: 700 }}>
                {japanese ? "薬屋のひとりごと" : "Kusuriya no Hitorigoto"}
              </Typography>
              {japanese && <Typography lang="ja" sx={{ fontSize: 12, color: "text.secondary" }}>くすりやのひとりごと</Typography>}
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>The Apothecary Diaries</Typography>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Exemplo · Sábado · 13:00 · EP03</Typography>
            </Card>

            <Card title="Sua privacidade">
              <Typography sx={{ fontSize: 16 }}>
                Minha Lista (datas, adiados) é só sua. No perfil, a aba Animes mostra as obras que você acompanha — sem progresso, notas ou episódios vistos.
              </Typography>
              <PillToggle
                label="Mostrar meus animes no perfil"
                hint="Ativado, quem visita seu perfil vê e pesquisa por gênero as obras que você acompanha. Você sempre vê a sua."
                checked={draft.animeListPublic}
                onChange={(v) => update("animeListPublic", v)}
              />
              <PillToggle
                label="Registrar minhas visitas aos perfis"
                hint="Ativado, quem você visita vê que você passou por lá. Desativado, ninguém vê suas visitas (nem as antigas), e você também não vê quem visitou o seu perfil."
                checked={draft.recordVisits}
                onChange={(v) => update("recordVisits", v)}
              />
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Publicações são públicas. Acompanhar uma obra e seguir uma pessoa nunca publicam uma mensagem por conta própria.
              </Typography>
            </Card>

            <Card title="Social desligado, agenda ativa">
              <Typography sx={{ fontSize: 16 }}>
                Desativar todas as notificações sociais não altera “Novos episódios e datas alteradas”. Os canais continuam separados no sino.
              </Typography>
              <Box>
                <Button
                  disabled={allSocialOff}
                  onClick={() => {
                    setDraft((d) => (d ? { ...d, ...(SOCIAL_OFF_PATCH as Partial<Draft>) } : d));
                    setStatus("idle");
                  }}
                  sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}
                >
                  Desativar todo o Social
                </Button>
              </Box>
            </Card>

            {status === "saved" && (
              <Box role="status" sx={{ display: "flex", gap: 2, p: 3, border: 1, borderColor: "divider", borderRadius: "16px" }}>
                <CheckCircleOutlinedIcon sx={{ color: "success.main", mt: "2px" }} />
                <Box>
                  <Typography sx={{ fontSize: 16 }}>Configurações salvas.</Typography>
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Preferências sociais atualizadas; lançamentos preservados.</Typography>
                </Box>
              </Box>
            )}
            {status === "error" && (
              <Alert severity="error" role="alert">
                Não foi possível salvar as configurações. Suas escolhas foram mantidas. Tente salvar novamente.
              </Alert>
            )}
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
