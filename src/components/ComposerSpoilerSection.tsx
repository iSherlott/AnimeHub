"use client";

import { Box, Checkbox, Stack, TextField, Typography } from "@mui/material";
import { parseSpoilerEpisode, spoilerLabel } from "@/lib/spoilers";

/**
 * "Contém spoilers" do editor de publicação: a marca, o "até o episódio" (que também libera o spoiler 7 dias depois da
 * estreia) e a prévia de como o aviso aparece no Feed.
 */
export function ComposerSpoilerSection({
  spoiler,
  onSpoilerChange,
  spoilerEpisode,
  onSpoilerEpisodeChange,
  workLabel,
}: {
  spoiler: boolean;
  onSpoilerChange: (value: boolean) => void;
  spoilerEpisode: string;
  onSpoilerEpisodeChange: (value: string) => void;
  workLabel: string | null;
}) {
  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Checkbox
            id="post-spoiler"
            checked={spoiler}
            onChange={(e) => onSpoilerChange(e.target.checked)}
            sx={{ p: 0.75, color: "text.secondary" }}
          />
          <Typography component="label" htmlFor="post-spoiler" sx={{ fontWeight: 700, fontSize: 14 }}>
            Contém spoilers
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Desmarcado por padrão. Ative quando o texto revelar acontecimentos. Para esconder só uma parte, use &ldquo;Esconder trecho
          (spoiler)&rdquo; no texto; para uma imagem, o botão Spoiler nela.
        </Typography>
        {spoiler && (
          <TextField
            label="Até o episódio (opcional)"
            value={spoilerEpisode}
            onChange={(e) => onSpoilerEpisodeChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
            helperText="Aparece no aviso, para quem ainda não chegou lá decidir se vê."
            slotProps={{ htmlInput: { inputMode: "numeric", "data-testid": "editor-spoiler-episode" } }}
            sx={{ maxWidth: 280 }}
          />
        )}
      </Box>

      {spoiler && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>COMO APARECERÁ NO FEED</Typography>
          <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Conteúdo com spoilers</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}>
                {spoilerLabel({ work: workLabel, episode: parseSpoilerEpisode(spoilerEpisode) ?? null })}
              </Box>
              {" · "}O texto fica oculto até você escolher revelar.
            </Typography>
          </Box>
        </Box>
      )}
    </>
  );
}
