"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/**
 * "Buscar notícias" das obras da temporada (chama o serviço news-fetcher; a
 * mesma busca roda uma vez por dia). Enquanto há uma execução em andamento o botão fica desabilitado e a
 * página se atualiza sozinha a cada 5 s até o resultado aparecer.
 */
export function RunNewsButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = running || busy;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [running, router]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/news/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível iniciar. Tente novamente.");
        return;
      }
      // A execução segue em segundo plano; o refresh mostra "Em execução".
      setTimeout(() => router.refresh(), 800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box>
        <Button startIcon={<PlayArrowOutlinedIcon />} onClick={() => void run()} disabled={active} sx={ELEVATED_BUTTON_SX} data-testid="run-news">
          {active ? "Em execução…" : "Buscar notícias"}
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 13, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
