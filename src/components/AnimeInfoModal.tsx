"use client";

import { useId, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import Image from "next/image";
import { Box, Chip, Dialog, IconButton, Skeleton, Stack, Typography } from "@mui/material";
import type { DiscoverItem } from "@/lib/discoverItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

const STATUS_LABELS: Record<string, string> = {
  RELEASING: "Em exibição",
  FINISHED: "Finalizado",
  NOT_YET_RELEASED: "Não estreou",
  CANCELLED: "Cancelado",
  HIATUS: "Em hiato",
};

export function AnimeInfoModal({
  item,
  open,
  onClose,
}: {
  item: DiscoverItem;
  open: boolean;
  onClose: () => void;
}) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const titleId = useId();
  const [coverLoaded, setCoverLoaded] = useState(false);
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa/
  // banner que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [coverBroken, setCoverBroken] = useState(false);
  const [bannerBroken, setBannerBroken] = useState(false);
  const showBanner = Boolean(item.bannerImage) && !bannerBroken;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
      <IconButton
        onClick={onClose}
        aria-label="Fechar"
        size="small"
        sx={{
          position: "absolute",
          right: 12,
          top: 12,
          zIndex: 1,
          bgcolor: "rgba(0,0,0,0.7)",
          color: "#f7f7f5",
          "&:hover": { bgcolor: "primary.main" },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      {item.bannerImage && !bannerBroken ? (
        <Box sx={{ position: "relative", height: 160, width: "100%", overflow: "hidden" }}>
          <Image
            src={item.bannerImage}
            alt=""
            fill
            sizes="(min-width: 600px) 600px, 100vw"
            style={{ objectFit: "cover", opacity: 0.5 }}
            onError={() => setBannerBroken(true)}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, #18171c, rgba(24,23,28,0.5), transparent)",
            }}
          />
        </Box>
      ) : (
        <Box sx={{ height: 64, width: "100%" }} />
      )}

      <Box sx={{ display: "flex", gap: 2, px: 3, pb: 2, mt: showBanner ? -6 : 0 }}>
        <Box
          sx={{
            position: "relative",
            height: 160,
            width: 112,
            flexShrink: 0,
            overflow: "hidden",
            border: 2,
            borderColor: "divider",
            bgcolor: "background.default",
          }}
        >
          {item.coverImage && !coverBroken ? (
            <>
              {!coverLoaded && (
                <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0 }} />
              )}
              <Image
                src={item.coverImage}
                alt=""
                fill
                sizes="112px"
                style={{ objectFit: "cover" }}
                onLoad={() => setCoverLoaded(true)}
                onError={() => setCoverBroken(true)}
              />
            </>
          ) : null}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, alignSelf: "flex-end" }}>
          <Typography id={titleId} variant="h5" component="h2" className="font-display" sx={{ textTransform: "uppercase", lineHeight: 1.2 }}>
            {title}
          </Typography>
          {item.titleNative && (
            <Typography className="font-jp" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {item.titleNative}
            </Typography>
          )}
        </Box>
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", px: 3, color: "text.secondary" }}>
        {item.episodes ? <Typography variant="caption">{item.episodes} episódios</Typography> : null}
        {item.status && (
          <Chip label={STATUS_LABELS[item.status] ?? item.status} size="small" sx={{ fontWeight: 700, textTransform: "uppercase" }} />
        )}
      </Stack>

      {item.genres.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, px: 3, flexWrap: "wrap" }}>
          {item.genres.map((g) => (
            <Chip key={g} label={g} size="small" variant="outlined" sx={{ textTransform: "uppercase" }} />
          ))}
        </Stack>
      )}

      {item.description ? (
        <Typography
          variant="body2"
          sx={{ mt: 2, px: 3, pb: 3, color: "text.secondary", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: item.description }}
        />
      ) : (
        <Typography variant="body2" sx={{ mt: 2, px: 3, pb: 3, color: "text.secondary" }}>
          Sem sinopse disponível.
        </Typography>
      )}
    </Dialog>
  );
}
