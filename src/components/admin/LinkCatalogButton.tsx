"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/** "Ligar ao catálogo": preenche o vínculo (catalogEntryId) de cópias e episódios que ainda não têm. Idempotente. */
export function LinkCatalogButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/integrity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Não foi possível ligar.");
        return;
      }
      setMessage(`Ligados: ${data.linked.productions} página(s), ${data.linked.listEntries} item(ns) de lista, ${data.linked.schedule} episódio(s).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => void run()} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="link-catalog">
        Ligar ao catálogo
      </Button>
      {message && (
        <Typography role="status" sx={{ fontSize: 14 }} data-testid="link-catalog-message">
          {message}
        </Typography>
      )}
    </>
  );
}
