"use client";

import { useRouter } from "next/navigation";
import { useState, type SelectHTMLAttributes } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  IconButton,
  Link as MuiLink,
  NativeSelect,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { KNOWN_PLATFORMS } from "@/lib/types";

type Link = { id: string; platform: string; url: string };

export function PlatformLinksManager({
  animeId,
  initialLinks,
}: {
  animeId: string;
  initialLinks: Link[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [platform, setPlatform] = useState<string>(KNOWN_PLATFORMS[0]);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function addLink() {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/platform-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, url: url.trim() }),
      });
      setUrl("");
      setFormOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/anime/${animeId}/platform-links?linkId=${linkId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <Box data-testid="platform-links" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {initialLinks.map((link) => (
          <Stack
            key={link.id}
            direction="row"
            data-testid={`platform-link-${link.platform}`}
            sx={{
              alignItems: "center",
              gap: 0.5,
              bgcolor: "primary.main",
              borderRadius: 5,
              py: 0.5,
              pl: 1.5,
              pr: 0.5,
            }}
          >
            <MuiLink
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`platform-link-open-${link.platform}`}
              className="font-display"
              underline="hover"
              sx={{ fontSize: 13, textTransform: "uppercase", color: "primary.contrastText" }}
            >
              Assistir na {link.platform}
            </MuiLink>
            <IconButton
              onClick={() => removeLink(link.id)}
              data-testid={`platform-link-remove-${link.platform}`}
              size="small"
              aria-label={`Remover link da ${link.platform}`}
              sx={{ color: "primary.contrastText", opacity: 0.8, "&:hover": { opacity: 1, bgcolor: "rgba(0,0,0,0.2)" } }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        ))}

        {initialLinks.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma plataforma vinculada ainda.
          </Typography>
        )}

        {!formOpen && (
          <IconButton
            onClick={() => setFormOpen(true)}
            data-testid="platform-link-add-toggle"
            size="small"
            aria-label="Vincular plataforma"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {formOpen && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <NativeSelect
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            // TypeScript's SelectHTMLAttributes has no data-* index signature,
            // even though React forwards arbitrary data attributes fine at runtime.
            inputProps={
              { "data-testid": "platform-select", "aria-label": "Plataforma de streaming" } as SelectHTMLAttributes<HTMLSelectElement>
            }
            size="small"
          >
            {KNOWN_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
          <TextField
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            slotProps={{ htmlInput: { "data-testid": "platform-url-input" } }}
            autoFocus
            size="small"
            sx={{ width: 256 }}
          />
          <Button onClick={addLink} disabled={saving} data-testid="platform-link-submit" variant="outlined" size="small">
            {saving ? "Salvando..." : "Vincular"}
          </Button>
          <Button onClick={() => setFormOpen(false)} size="small" color="inherit">
            cancelar
          </Button>
        </Stack>
      )}
    </Box>
  );
}
