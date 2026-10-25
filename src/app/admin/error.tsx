"use client";

import { useEffect } from "react";
import { Box, Button, Typography } from "@mui/material";

/**
 * Erro numa página Admin (Fase 9, §19): mensagem clara, "Tentar de novo" (erro recuperável, como o banco ocupado) e o
 * código para o log. A barra lateral continua disponível para ir a outra área.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] página falhou:", error);
  }, [error]);
  return (
    <Box role="alert" data-testid="admin-error" sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", p: 3, border: 1, borderColor: "divider", borderRadius: "12px" }}>
      <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700 }}>
        Não foi possível carregar esta página.
      </Typography>
      <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
        Pode ser uma falha passageira (banco ou serviço ocupado). Nada foi alterado. Tente de novo; se continuar, abra Admin → Logs.
      </Typography>
      {error.digest && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Código: {error.digest}</Typography>}
      <Button variant="contained" onClick={() => reset()} autoFocus>
        Tentar de novo
      </Button>
    </Box>
  );
}
