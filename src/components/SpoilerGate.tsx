"use client";

import { useId, useState, type ReactNode } from "react";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";

/**
 * Aviso de spoiler (Figma `13:43079`, fluxo F `13:44298`, P-12): o servidor
 * NÃO envia o texto — só este placeholder. O conteúdo é buscado em
 * `revealUrl` apenas quando a pessoa clica em "Revelar conteúdo (spoilers)"
 * e some de novo em "Ocultar novamente". Revelar um item nunca revela outro,
 * e erro de rede nunca mostra texto parcial.
 *
 * Visual do Figma "Spoiler / Hidden": bloco "surface" com raio 12 e
 * respiro de 24 px, aviso com ícone de olho cortado e botão "elevated".
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
        <Typography component="p" sx={{ color: "text.secondary", fontSize: 12, fontWeight: 700, mb: 1 }}>
          Spoilers revelados
        </Typography>
        {render(data)}
        <Button
          onClick={() => setData(null)}
          size="small"
          aria-expanded="true"
          sx={{ px: 0, minWidth: 0, mt: 0.5, color: "text.secondary" }}
        >
          Ocultar novamente
        </Button>
      </Box>
    );
  }

  return (
    <Box
      data-testid="spoiler-notice"
      sx={{ p: 3, bgcolor: "background.paper", borderRadius: "12px", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <VisibilityOffOutlinedIcon sx={{ fontSize: 18, mt: "3px" }} aria-hidden />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Conteúdo com spoilers</Typography>
      </Stack>
      <Typography id={descId} sx={{ color: "text.secondary", fontSize: 14 }}>
        {context ? `${context} · ` : ""}O texto fica oculto até você escolher revelar.
      </Typography>
      {failed && (
        <Alert severity="error" role="alert">
          Não foi possível carregar o conteúdo. Tente novamente.
        </Alert>
      )}
      <Box>
        <Button
          onClick={reveal}
          disabled={loading}
          aria-expanded="false"
          aria-describedby={descId}
          sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}
        >
          {loading ? "Carregando…" : "Revelar conteúdo (spoilers)"}
        </Button>
      </Box>
    </Box>
  );
}
