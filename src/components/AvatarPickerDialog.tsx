"use client";

import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SearchIcon from "@mui/icons-material/Search";
import { Box, ButtonBase, Dialog, IconButton, InputBase, Typography } from "@mui/material";
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

const TEXTS = {
  avatar: { title: "Seleção de Avatar", lead: "Escolha seu avatar! Você pode mudá-lo a qualquer momento.", option: "Avatar", plural: "Avatares", remove: "Remover foto (usar a padrão)" },
  banner: { title: "Seleção de Banner", lead: "Escolha o banner do seu perfil. Você pode mudá-lo a qualquer momento.", option: "Banner", plural: "Banners", remove: "Remover banner" },
  background: { title: "Seleção de Plano de Fundo", lead: "Escolha o plano de fundo do seu perfil. Você pode mudá-lo a qualquer momento.", option: "Plano de fundo", plural: "Planos de fundo", remove: "Remover plano de fundo" },
} as const;

type Page = { groups: AvatarGroup[]; total: number; page: number; pages: number };

/**
 * "Seleção de Avatar" (e de banner e de plano de fundo): as imagens das obras que a pessoa acompanha, uma fileira por
 * obra (todas as temporadas juntas, sem repetir imagem), no estilo da Crunchyroll — com busca pelo título e páginas de
 * 8 obras. Escolher e Salvar grava na hora (PATCH /api/users/me/avatar); no avatar, a pessoa também pode voltar à foto
 * padrão. Não há envio de foto própria: avatar, capa e fundo são sempre imagens dos animes acompanhados.
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
  kind: "avatar" | "banner" | "background";
  userId: string;
  displayName: string;
  current: string | null;
  onClose: () => void;
  onSaved: (url: string | null) => void;
}) {
  const { preference } = useTitlePreference();
  const [result, setResult] = useState<Page | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(current);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAvatar = kind === "avatar";
  const texts = TEXTS[kind];

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(current);
    setError(null);
  }, [open, current]);

  // A busca vai ao servidor 250 ms depois da última tecla e volta para a primeira página.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(0);
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(false);
    let cancelled = false;
    const params = new URLSearchParams({ kind, page: String(page) });
    if (debounced) params.set("q", debounced);
    fetch(`/api/users/me/avatar?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falha"))))
      .then((data: Page) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, page, debounced]);

  const groups = result?.groups ?? null;

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
      const res = isAvatar ? await fetch("/api/users/me/avatar", { method: "DELETE" }) : await fetch("/api/users/me/avatar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, url: null }) });
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
            {texts.title}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>{texts.lead}</Typography>
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

      {/* Busca pelo título da obra e as páginas (8 obras por vez). */}
      <Box sx={{ px: { xs: 2, sm: 4 }, pt: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Box component="form" role="search" onSubmit={(e) => e.preventDefault()} sx={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, bgcolor: "#141414", border: "1px solid #3a3a3a", borderRadius: "6px", "&:focus-within": { borderColor: "#8a8a8a" } }}>
          <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar anime" fullWidth inputProps={{ maxLength: 80, "aria-label": "Buscar anime", "data-testid": "avatar-picker-search" }} sx={{ fontSize: 14, "& input": { p: 0 } }} />
        </Box>
        {result && result.pages > 1 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} data-testid="avatar-picker-pages">
            <IconButton size="small" onClick={() => setPage((p) => p - 1)} disabled={result.page === 0} aria-label="Página anterior" sx={{ color: "text.primary" }}>
              <ChevronLeftIcon />
            </IconButton>
            <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {result.page + 1} de {result.pages}
            </Typography>
            <IconButton size="small" onClick={() => setPage((p) => p + 1)} disabled={result.page >= result.pages - 1} aria-label="Próxima página" sx={{ color: "text.primary" }}>
              <ChevronRightIcon />
            </IconButton>
          </Box>
        )}
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
            {debounced ? `Nenhum anime da sua lista com “${debounced}”.` : `Acompanhe um anime para escolher imagens dele aqui — a capa e os personagens viram opções de ${texts.option.toLowerCase()}.`}
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
                <ScrollCarousel label={`${texts.plural} de ${title}`}>
                  {items.map((item) => {
                    const on = selected === item.url;
                    return (
                      <ButtonBase
                        key={item.url}
                        onClick={() => setSelected(item.url)}
                        aria-label={`${texts.option}: ${item.label}`}
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
              {texts.remove}
            </ButtonBase>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
