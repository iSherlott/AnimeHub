"use client";

import { useId, useState, type ReactNode } from "react";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";

/**
 * Aviso de spoiler (Figma `13:43079`, fluxo F `13:44298`, P-12): o servidor
 * NÃO envia o texto — só este placeholder. O conteúdo é buscado em
 * `revealUrl` apenas quando a pessoa clica em "Revelar conteúdo (spoilers)"
 * e some de novo em "Ocultar novamente". Revelar um item nunca revela outro,
 * e erro de rede nunca mostra texto parcial.
 */
export function SpoilerGate<T>({
  revealUrl,
  context,
  render,
}: {
  revealUrl: string;
  /** Obra/produção — continua visível (o texto é que fica oculto). */
  context?: string;
  render: (data: T) => ReactNode;
}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const descId = useId();

  async function reveal() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(revealUrl);
      if (!res.ok) throw new Error("falha");
      setData((await res.json()) as T);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (data !== null) {
    return (
      <Box data-testid="spoiler-revealed">
        <Typography variant="overline" sx={{ color: "text.secondary", display: "block" }}>
          Spoilers revelados
        </Typography>
        {render(data)}
        <Button
          onClick={() => setData(null)}
          size="small"
          aria-expanded="true"
          sx={{ px: 0, minWidth: 0, textTransform: "none", mt: 0.5 }}
        >
          Ocultar novamente
        </Button>
      </Box>
    );
  }

  return (
    <Box
      data-testid="spoiler-notice"
      sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1.5, bgcolor: "background.default" }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <VisibilityOffIcon fontSize="small" aria-hidden />
        <Typography sx={{ fontWeight: 700 }}>Conteúdo com spoilers</Typography>
      </Stack>
      <Typography id={descId} variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
        {context ? `${context}. ` : ""}O texto fica oculto até você escolher revelar.
      </Typography>
      {failed && (
        <Alert severity="error" role="alert" sx={{ mb: 1 }}>
          Não foi possível carregar o conteúdo. Tente novamente.
        </Alert>
      )}
      <Button
        onClick={reveal}
        disabled={loading}
        variant="outlined"
        size="small"
        aria-expanded="false"
        aria-describedby={descId}
      >
        {loading ? "Carregando…" : "Revelar conteúdo (spoilers)"}
      </Button>
    </Box>
  );
}
