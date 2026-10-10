"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button } from "@mui/material";
import { ConfirmDialog } from "@/components/StatePanels";

/**
 * "Deixar de acompanhar" com o diálogo de confirmação do Figma (`8:5802`):
 * explica o efeito antes de aplicar, foco inicial em Cancelar, Esc/Cancelar
 * não alteram nada e o botão principal vira "Removendo…" durante o envio.
 * Remover nunca mexe em "episódios assistidos" — esse conceito não existe.
 */
export function UnfollowButton({ animeId, title }: { animeId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${animeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível remover. Tente novamente.");
        return;
      }
      setOpen(false);
      router.push("/minha-lista");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Button
        variant="outlined"
        color="inherit"
        size="small"
        onClick={() => setOpen(true)}
        data-testid="unfollow-button"
      >
        Deixar de acompanhar
      </Button>
      <ConfirmDialog
        open={open}
        title="Remover acompanhamento?"
        subject={
          <>
            <strong>{title}</strong> está na sua lista pessoal.
          </>
        }
        effect="As próximas datas e notificações deste anime deixam sua agenda. A produção permanece no catálogo e você pode acompanhar novamente. Nenhum episódio assistido será alterado, pois não há tracking de consumo."
        confirmLabel="Remover acompanhamento"
        busyLabel="Removendo…"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={confirmRemove}
        confirmTestId="unfollow-confirm"
      />
    </Box>
  );
}
