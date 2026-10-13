"use client";

import { useState } from "react";
import NextLink from "next/link";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import { Alert, Button } from "@mui/material";

/**
 * "+ Acompanhar" do detalhe público (D-03). Visitante: leva ao login sem
 * criar vínculo nenhum (o vínculo só nasce quando a pessoa confirma depois
 * de voltar — `8:2371`). Autenticado: cria o vínculo.
 */
export function FollowProductionButton({
  anilistId,
  initialAnimeId,
  loggedIn,
}: {
  anilistId: number;
  initialAnimeId: string | null;
  /** Vem do servidor (cookie de sessão) — evita piscar o botão errado. */
  loggedIn: boolean;
}) {
  const [animeId, setAnimeId] = useState<string | null>(initialAnimeId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (animeId) {
    return (
      <Button
        component={NextLink}
        href={`/anime/${animeId}`}
        variant="outlined"
        startIcon={<CheckIcon />}
        data-testid="following-button"
      >
        Acompanhando
      </Button>
    );
  }

  if (!loggedIn) {
    return (
      <Button
        component={NextLink}
        href={`/login?next=${encodeURIComponent(`/anime/${anilistId}`)}`}
        variant="contained"
        startIcon={<AddIcon />}
        data-testid="follow-login-button"
      >
        Entre para acompanhar
      </Button>
    );
  }

  async function follow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/anime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anilistId }),
      });
      if (res.status === 409) {
        // Já existia (outra aba): só precisamos do id para o link.
        const list = await fetch("/api/anime").then((r) => r.json());
        const found = list.animes?.find((a: { anilistId: number }) => a.anilistId === anilistId);
        if (found) setAnimeId(found.id);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível acompanhar. Tente novamente.");
        return;
      }
      const data = await res.json();
      setAnimeId(data.anime.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={follow}
        disabled={busy}
        data-testid="follow-button"
      >
        {busy ? "Acompanhando…" : "Acompanhar"}
      </Button>
      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </>
  );
}
