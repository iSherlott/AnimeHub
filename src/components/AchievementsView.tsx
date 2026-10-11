"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, Typography } from "@mui/material";
import { AchievementTitleBadge } from "@/components/AchievementTitleBadge";
import { CoverImage } from "@/components/CoverImage";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { UserAvatar } from "@/components/UserAvatar";
import type { TitleDTO } from "@/lib/quiz";

type Me = { id: string; displayName: string; handle: string | null; avatarUrl: string | null };

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** Identidade com o título equipado sob o nome (Figma `ProfilePreview`). */
function ProfilePreview({ me, title }: { me: Me; title: string | null }) {
  return (
    <Box data-testid="profile-preview" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <UserAvatar id={me.id} displayName={me.displayName} avatarUrl={me.avatarUrl} size={28} />
        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{me.displayName}</Typography>
        {me.handle && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>@{me.handle}</Typography>}
      </Box>
      {title && (
        <Box sx={{ pl: "36px" }}>
          <AchievementTitleBadge title={title} />
        </Box>
      )}
    </Box>
  );
}

function AchievementCard({ title, busy, onEquip, onRemove }: { title: TitleDTO; busy: boolean; onEquip: () => void; onRemove: () => void }) {
  const workName = title.work.titleNative ?? title.work.titleRomaji;
  return (
    <Box
      data-testid={`achievement-${title.id}`}
      data-equipped={title.equipped ? "true" : "false"}
      sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 3, border: title.equipped ? "2px solid #8b5cf6" : "1px solid", borderColor: title.equipped ? "#8b5cf6" : "divider" }}
    >
      <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
        <Box sx={{ position: "relative", width: 120, height: 180, flexShrink: 0, borderRadius: "12px", overflow: "hidden", bgcolor: "#171820" }}>
          {title.work.coverImage && <CoverImage src={title.work.coverImage} sizes="120px" />}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6" }}>{title.equipped ? "✓ EQUIPADO" : "DESBLOQUEADO"}</Typography>
          <Typography component="h3" sx={{ fontSize: 26, lineHeight: 1.5 }}>
            {title.name}
          </Typography>
          <Typography lang={title.work.titleNative ? "ja" : undefined} sx={{ fontSize: 18 }}>
            {workName}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{title.work.titleEnglish ?? title.work.titleRomaji}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Quiz · 10 de 10 respostas corretas · {title.scope}</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 14 }}>Título cosmético persistente. Continua na sua coleção mesmo se a obra sair de Acompanhando.</Typography>
      <Box>
        {title.equipped ? (
          <Button onClick={onRemove} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="achievement-remove">
            Remover do perfil
          </Button>
        ) : (
          <Button variant="contained" onClick={onEquip} disabled={busy} data-testid="achievement-equip">
            Equipar título
          </Button>
        )}
      </Box>
    </Box>
  );
}

/**
 * Minhas conquistas (Figma `41:28061`): coleção de títulos com "Equipar título" / "Remover do perfil" e o
 * painel "No seu perfil agora". Um título por vez, ou nenhum; remover do perfil não remove da coleção.
 */
export function AchievementsView({ me, initialTitles }: { me: Me; initialTitles: TitleDTO[] }) {
  const router = useRouter();
  const [titles, setTitles] = useState(initialTitles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const equipped = titles.find((t) => t.equipped) ?? null;

  async function equip(titleId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/titles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titleId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível alterar o título.");
      setTitles(data.titles as TitleDTO[]);
      setPickerOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar o título.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" }, columnGap: 4, rowGap: 4, alignItems: "start" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        {titles.length === 0 ? (
          <Panel title="Você ainda não desbloqueou títulos" testId="achievements-empty">
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Faça o quiz de uma obra que você acompanha e acerte as 10 perguntas para ganhar um título cosmético.
            </Typography>
            <Box>
              <Button component={NextLink} href="/minha-lista" sx={ELEVATED_BUTTON_SX}>
                Ver meus animes
              </Button>
            </Box>
          </Panel>
        ) : (
          <Box id="colecao" sx={{ display: "flex", flexDirection: "column", gap: 3 }} data-testid="achievements-list">
            {titles.map((t) => (
              <AchievementCard key={t.id} title={t} busy={busy} onEquip={() => void equip(t.id)} onRemove={() => void equip(null)} />
            ))}
          </Box>
        )}
        {error && (
          <Typography role="alert" sx={{ fontSize: 14, color: "primary.main" }}>
            {error}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Panel title="No seu perfil agora" testId="profile-now">
          <ProfilePreview me={me} title={equipped?.name ?? null} />
          <Box>
            <Button
              onClick={() => {
                setPick(equipped?.id ?? null);
                setPickerOpen(true);
              }}
              disabled={titles.length === 0}
              sx={ELEVATED_BUTTON_SX}
              data-testid="choose-title"
            >
              Escolher título
            </Button>
          </Box>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Você equipa um único título por vez — ou nenhum. Remover do perfil não remove da coleção.
          </Typography>
        </Panel>
        <Panel title="Seu título permanece">
          <Typography sx={{ fontSize: 14 }}>
            Tirar a obra de Acompanhando ou removê-la da lista não apaga a recompensa. Mesmo sem acompanhar o anime, um título já desbloqueado pode ser equipado.
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Não há XP, nível, ranking ou recompensa parcial.</Typography>
        </Panel>
      </Box>

      <Dialog open={pickerOpen} onClose={() => !busy && setPickerOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { bgcolor: "background.paper", backgroundImage: "none", border: 1, borderColor: "divider", borderRadius: "16px" } } }}>
        <Box sx={{ p: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography component="h2" sx={{ fontSize: 24 }}>
            Escolher título
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Um título por vez. A escolha só muda como você aparece; sua coleção continua igual.</Typography>
          <Box role="radiogroup" aria-label="Títulos disponíveis" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {[{ id: null as string | null, name: "Nenhum título" }, ...titles.map((t) => ({ id: t.id as string | null, name: t.name }))].map((option) => {
              const selected = pick === option.id;
              return (
                <Box
                  key={option.id ?? "none"}
                  component="button"
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPick(option.id)}
                  sx={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "text.primary", p: 2.5, borderRadius: "10px", bgcolor: selected ? "#1b152b" : "transparent", border: 1, borderColor: selected ? "#8b5cf6" : "divider" }}
                >
                  {selected ? "◉ " : "○ "}
                  {option.name}
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button variant="contained" onClick={() => void equip(pick)} disabled={busy} data-testid="title-confirm">
              {busy ? "Salvando…" : "Confirmar"}
            </Button>
            <Button onClick={() => setPickerOpen(false)} disabled={busy} sx={ELEVATED_BUTTON_SX}>
              Cancelar
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
