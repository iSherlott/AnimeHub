"use client";

import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, ButtonBase, Dialog, IconButton, Typography } from "@mui/material";
import { ScrollCarousel } from "@/components/ScrollCarousel";
import { UserAvatar } from "@/components/UserAvatar";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import type { AvatarGroup } from "@/lib/avatarOptions";

/** Laranja do botão e dos links do perfil (referência: a Seleção de Avatar da Crunchyroll). */
export const PROFILE_ACCENT = "#f47521";

const outlinedButton = (enabled: boolean) => ({
  px: 3,
  py: 1.25,
  minWidth: 120,
  border: "2px solid",
  borderColor: enabled ? PROFILE_ACCENT : "#4b4b4b",
  color: enabled ? PROFILE_ACCENT : "#6b6b6b",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  "&:hover": enabled ? { bgcolor: "rgba(244,117,33,0.12)" } : undefined,
  "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 },
});

/**
 * "Seleção de Avatar" (e de banner): as imagens das obras que a pessoa acompanha, uma fileira por obra,
 * no estilo da Crunchyroll. Escolher e Salvar grava na hora (PATCH /api/users/me/avatar); no avatar, a pessoa também
 * pode voltar às iniciais. Não há envio de foto própria: avatar e capa são sempre imagens dos animes acompanhados.
 */
export function AvatarPickerDialog({
  open,
  kind,
  userId,
  displayName,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: "avatar" | "banner";
  userId: string;
  displayName: string;
  current: string | null;
  onClose: () => void;
  onSaved: (url: string | null) => void;
}) {
  const { preference } = useTitlePreference();
  const [groups, setGroups] = useState<AvatarGroup[] | null>(null);
  const [selected, setSelected] = useState<string | null>(current);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAvatar = kind === "avatar";

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(current);
    setError(null);
    setLoadError(false);
    let cancelled = false;
    fetch("/api/users/me/avatar")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falha"))))
      .then((data: { groups: AvatarGroup[] }) => {
        if (!cancelled) setGroups(data.groups);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, current]);

  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/avatar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, url: selected }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      onSaved(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = isAvatar ? await fetch("/api/users/me/avatar", { method: "DELETE" }) : await fetch("/api/users/me/avatar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "banner", url: null }) });
      if (!res.ok) throw new Error("Não foi possível remover.");
      onSaved(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  const changed = selected !== null && selected !== current;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="md"
      aria-labelledby="avatar-picker-title"
      slotProps={{ paper: { sx: { bgcolor: "#232323", backgroundImage: "none", borderRadius: "4px", height: "min(86vh, 860px)" } } }}
    >
      <Box sx={{ bgcolor: "#141414", px: { xs: 2, sm: 4 }, py: 3, display: "flex", alignItems: "center", gap: 3, position: "relative" }}>
        {isAvatar ? (
          <UserAvatar id={userId} displayName={displayName} avatarUrl={selected} size={96} />
        ) : (
          <Box sx={{ width: 160, height: 64, borderRadius: "4px", overflow: "hidden", bgcolor: "#2a2a2a", flexShrink: 0 }}>
            {selected && <Box component="img" src={selected} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography id="avatar-picker-title" component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>
            {isAvatar ? "Seleção de Avatar" : "Seleção de Banner"}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>
            {isAvatar ? "Escolha seu avatar! Você pode mudá-lo a qualquer momento." : "Escolha o banner do seu perfil. Você pode mudá-lo a qualquer momento."}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <ButtonBase onClick={onClose} disabled={busy} sx={outlinedButton(true)}>
              Cancelar
            </ButtonBase>
            <ButtonBase onClick={() => void save()} disabled={!changed || busy} sx={outlinedButton(changed && !busy)} data-testid="avatar-picker-save">
              {busy ? "Salvando…" : "Salvar"}
            </ButtonBase>
          </Box>
        </Box>
        <IconButton onClick={onClose} disabled={busy} aria-label="Fechar" sx={{ position: "absolute", top: 12, right: 12, color: "text.primary", border: "2px solid", borderColor: "#6b6b6b" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ overflowY: "auto", px: { xs: 2, sm: 4 }, py: 3, display: "flex", flexDirection: "column", gap: 4, flex: 1 }} data-testid="avatar-picker-list">
        {error && (
          <Typography role="alert" sx={{ fontSize: 14, color: "#ef4444" }}>
            {error}
          </Typography>
        )}
        {loadError ? (
          <Typography role="alert" sx={{ fontSize: 14 }}>
            Não foi possível carregar as imagens. Feche e tente de novo.
          </Typography>
        ) : groups === null ? (
          <Typography role="status" sx={{ fontSize: 14, color: "text.secondary" }}>
            Carregando…
          </Typography>
        ) : groups.length === 0 ? (
          <Typography data-testid="avatar-picker-empty" sx={{ fontSize: 14, color: "text.secondary" }}>
            Acompanhe um anime para escolher imagens dele aqui — a capa e os personagens viram opções de {isAvatar ? "avatar" : "banner"}.
          </Typography>
        ) : (
          groups.map((group) => {
            const items = isAvatar ? group.avatars : group.banners;
            if (items.length === 0) return null;
            const title = resolveTitleText(preference, group);
            return (
              <Box key={group.key} component="section" aria-label={title} data-testid={`avatar-group-${group.key}`}>
                <Typography lang={preference.language === "ja" && group.titleNative ? "ja" : undefined} sx={{ fontSize: 18, mb: 2 }}>
                  {title}
                </Typography>
                <ScrollCarousel label={`${isAvatar ? "Avatares" : "Banners"} de ${title}`}>
                  {items.map((item) => {
                    const on = selected === item.url;
                    return (
                      <ButtonBase
                        key={item.url}
                        onClick={() => setSelected(item.url)}
                        aria-label={`${isAvatar ? "Avatar" : "Banner"}: ${item.label}`}
                        aria-pressed={on}
                        data-testid="avatar-option"
                        sx={{
                          flexShrink: 0,
                          width: isAvatar ? 96 : 220,
                          height: isAvatar ? 96 : 88,
                          borderRadius: isAvatar ? "50%" : "4px",
                          overflow: "hidden",
                          bgcolor: "#fff",
                          outline: on ? `4px solid ${PROFILE_ACCENT}` : "4px solid transparent",
                          outlineOffset: 2,
                          "&:focus-visible": { outline: "4px solid #ffd400" },
                        }}
                      >
                        <Box component="img" src={item.url} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </ButtonBase>
                    );
                  })}
                </ScrollCarousel>
              </Box>
            );
          })
        )}
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", pt: 1, borderTop: 1, borderColor: "#3a3a3a" }}>
          {current && (
            <ButtonBase onClick={() => void remove()} disabled={busy} sx={{ color: "#c0392b", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }} data-testid="avatar-remove">
              {isAvatar ? "Remover foto (usar iniciais)" : "Remover banner"}
            </ButtonBase>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
