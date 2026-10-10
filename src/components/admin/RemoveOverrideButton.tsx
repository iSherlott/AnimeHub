"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { Button } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ConfirmDialog } from "@/components/StatePanels";

/** "Remover override" com a confirmação do Figma (`8:5802`): explica o efeito, foco em Cancelar, nada muda ao clicar só na linha. */
export function RemoveOverrideButton({ id, subject, effect }: { id: string; subject: string; effect: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/overrides/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível remover. Tente novamente.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="small" startIcon={<DeleteOutlinedIcon />} onClick={() => { setError(null); setOpen(true); }} sx={ELEVATED_BUTTON_SX} data-testid={`remove-override-${id}`}>
        Remover override
      </Button>
      <ConfirmDialog
        open={open}
        title="Remover override?"
        subject={subject}
        effect={effect}
        confirmLabel="Remover override"
        busyLabel="Removendo…"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
        confirmTestId="remove-override-confirm"
      />
    </>
  );
}
