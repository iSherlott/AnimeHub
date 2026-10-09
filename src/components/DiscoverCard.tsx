"use client";

import { loginHref } from "@/lib/safeRedirect";
import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Image from "next/image";
import AddIcon from "@mui/icons-material/Add";
import CachedIcon from "@mui/icons-material/Cached";
import CheckIcon from "@mui/icons-material/Check";
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Popover,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { DiscoverItem } from "@/lib/discoverItem";
import { KNOWN_PLATFORMS } from "@/lib/types";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { AnimeInfoModal } from "@/components/AnimeInfoModal";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

function formatNextEpisode(iso: string | null, number: number | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (date.getTime() < Date.now()) return null;
  const formatted = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return number ? `Ep ${number} em ${formatted}` : `Próximo em ${formatted}`;
}

export function DiscoverCard({
  item,
  rank,
  fill,
}: {
  item: DiscoverItem;
  rank?: number;
  /** Pra grade responsiva (lote 4 do Epic 27) — ocupa 100% da célula da
   * grade em vez da largura fixa usada nas fileiras horizontais (`Row`). */
  fill?: boolean;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const [showInfo, setShowInfo] = useState(false);
  const [platform, setPlatform] = useState<string>(KNOWN_PLATFORMS[0]);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [addedAnimeId, setAddedAnimeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [coverBroken, setCoverBroken] = useState(false);

  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const nextEpisodeLabel = formatNextEpisode(item.nextEpisodeAt, item.nextEpisodeNumber);
  const canAdd = item.anilistId != null;
  // "Já na lista" cobre 2 casos: já estava lá antes desta página carregar
  // (item.inMyList, anotado pelo BFF) ou acabou de ser adicionado nesta
  // sessão (done, via handleAdd) — mesmo card, sem precisar recarregar.
  const owned = item.inMyList || done;
  const ownedAnimeId = item.animeId ?? addedAnimeId;
  const addButtonLabel = owned
    ? "Acompanhando — ver"
    : !canAdd
      ? "Disponível quando a AniList voltar ao ar"
      : user === undefined
        ? "Carregando..."
        : user
          ? "Acompanhar"
          : "Entre para acompanhar";

  function handleAddButtonClick(e: React.MouseEvent<HTMLElement>) {
    if (owned) {
      if (ownedAnimeId) router.push(`/anime/${ownedAnimeId}`);
      return;
    }
    if (!canAdd || user === undefined) return; // ainda checando se está logado
    if (!user) {
      router.push(loginHref(window.location.pathname + window.location.search));
      return;
    }
    setAnchorEl(e.currentTarget);
  }

  async function handleAdd() {
    if (!item.anilistId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/anime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anilistId: item.anilistId,
          platform,
          url: url.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao adicionar");
        return;
      }
      setDone(true);
      setAddedAnimeId(data.anime?.id ?? null);
      setAnchorEl(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      sx={{
        width: fill ? "100%" : { xs: 144, sm: 176 },
        flexShrink: fill ? undefined : 0,
        // Alvo do hover abaixo — grupo inteiro, não só o título (achado do
        // pedido de retrabalho, lote 4 do Epic 27: hoje só o título reage
        // ao passar o mouse, o resto do card fica sem nenhum feedback).
        "&:hover .discover-card-cover": {
          transform: "scale(1.03)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
        },
      }}
    >
      <Box
        className="discover-card-cover"
        sx={{
          position: "relative",
          aspectRatio: "2 / 3",
          width: "100%",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        {item.coverImage && !coverBroken ? (
          <Image
            src={item.coverImage}
            alt=""
            fill
            sizes="192px"
            style={{ objectFit: "cover" }}
            onError={() => setCoverBroken(true)}
          />
        ) : (
          <Box sx={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center", px: 1, textAlign: "center" }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {title}
            </Typography>
          </Box>
        )}

        {/* Gradiente sutil no rodapé — garante contraste do selo de
            próximo episódio mesmo sobre capas muito claras (mesmo padrão
            já usado em HeroBanner/CalendarEntryPreview). */}
        <Box
          sx={{
            position: "absolute",
            insetInline: 0,
            bottom: 0,
            height: "35%",
            background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
            pointerEvents: "none",
          }}
        />

        {item.cached && (
          <Chip
            icon={<CachedIcon sx={{ fontSize: 14 }} />}
            label="cache"
            size="small"
            sx={{
              position: "absolute",
              top: 6,
              left: 6,
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              bgcolor: "warning.main",
              color: "background.default",
              "& .MuiChip-icon": { color: "background.default" },
            }}
          />
        )}

        <Tooltip title={addButtonLabel}>
          <span style={{ position: "absolute", top: 4, right: 4 }}>
            <IconButton
              onClick={handleAddButtonClick}
              disabled={owned ? !ownedAnimeId : !canAdd}
              size="small"
              aria-label={addButtonLabel}
              sx={{
                bgcolor: owned ? "success.main" : "rgba(0,0,0,0.7)",
                color: owned ? "background.default" : "text.primary",
                "&:hover": { bgcolor: owned ? "success.main" : "primary.main" },
                "&.Mui-disabled": { opacity: 0.5 },
              }}
            >
              {owned ? <CheckIcon fontSize="small" /> : <AddIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

        {nextEpisodeLabel && (
          <Box sx={{ position: "absolute", insetInline: 0, bottom: 0, bgcolor: "rgba(11,11,13,0.85)", px: 0.75, py: 0.5, textAlign: "center" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "success.main", fontSize: 10 }}>
              {nextEpisodeLabel}
            </Typography>
          </Box>
        )}

        {rank && (
          <Typography
            className="font-display"
            sx={{
              position: "absolute",
              bottom: -4,
              left: -4,
              fontSize: "2.25rem",
              lineHeight: 1,
              color: rank <= 3 ? "primary.main" : "text.secondary",
              textShadow: "2px 2px 0 #000",
            }}
          >
            {rank}
          </Typography>
        )}
      </Box>

      <Tooltip title={title}>
        <Button
          {...(owned && ownedAnimeId
            ? { component: NextLink, href: `/anime/${ownedAnimeId}` }
            : { onClick: () => setShowInfo(true) })}
          className="font-display"
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            mt: 1,
            px: 0,
            minWidth: 0,
            textAlign: "left",
            textTransform: "uppercase",
            fontSize: 12,
            lineHeight: 1.3,
            color: "text.primary",
            "&:hover": { color: "primary.light", bgcolor: "transparent", textDecoration: "underline" },
          }}
        >
          {title}
        </Button>
      </Tooltip>
      {item.episodes ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {item.episodes} eps
        </Typography>
      ) : null}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          setError(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ width: 224, p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} size="small" fullWidth>
            {KNOWN_PLATFORMS.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </Select>
          <TextField
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link do título (opcional)"
            size="small"
            fullWidth
          />
          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
          <Button onClick={handleAdd} disabled={saving} variant="contained" fullWidth>
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </Box>
      </Popover>

      <AnimeInfoModal item={item} open={showInfo} onClose={() => setShowInfo(false)} />
    </Box>
  );
}
