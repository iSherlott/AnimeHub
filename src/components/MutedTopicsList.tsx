"use client";

import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";

type Mute = { kind: "WORK" | "TAG"; key: string; label: string };

/**
 * Silenciados (12/11/2026): as obras e # que a pessoa tirou do Feed, com "Mostrar de novo". Silenciar é pelo menu "···"
 * de cada publicação. Fica fora do "Salvar" das preferências: cada botão já vale na hora.
 */
export function MutedTopicsList() {
  const [mutes, setMutes] = useState<Mute[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/mutes")
      .then((r) => (r.ok ? r.json() : { mutes: [] }))
      .then((d) => alive && setMutes(d.mutes ?? []))
      .catch(() => alive && setMutes([]));
    return () => {
      alive = false;
    };
  }, []);

  async function unmute(m: Mute) {
    const res = await fetch(`/api/mutes?kind=${m.kind}&key=${encodeURIComponent(m.key)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setMutes((list) => list?.filter((x) => !(x.kind === m.kind && x.key === m.key)) ?? null);
  }

  if (mutes === null) return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Carregando…</Typography>;
  if (mutes.length === 0) {
    return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nada silenciado. Para tirar uma obra ou uma # do seu Feed, use o menu “···” de uma publicação sobre ela.</Typography>;
  }
  return (
    <Box component="ul" data-testid="muted-list" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
      {mutes.map((m) => (
        <Box component="li" key={`${m.kind}:${m.key}`} data-testid="muted-item" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{m.label}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{m.kind === "WORK" ? "Obra" : "Hashtag"}</Typography>
          </Box>
          <Button size="small" onClick={() => void unmute(m)} data-testid="unmute">
            Mostrar de novo
          </Button>
        </Box>
      ))}
    </Box>
  );
}
