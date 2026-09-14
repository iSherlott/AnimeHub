import { Box } from "@mui/material";

/** Só embute quando o site é o YouTube — a AniList também usa "dailymotion"
 * às vezes, mas não temos uma URL de embed confiável pra construir por lá,
 * então melhor não mostrar nada a ter um trailer quebrado. */
export function TrailerEmbed({ id }: { id: string }) {
  return (
    <Box sx={{ position: "relative", width: "100%", maxWidth: 640, aspectRatio: "16 / 9", bgcolor: "background.paper" }}>
      <iframe
        src={`https://www.youtube.com/embed/${encodeURIComponent(id)}`}
        title="Trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
      />
    </Box>
  );
}
