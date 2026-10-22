"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import type { ReviewPair, ReviewSide } from "@/lib/curation/duplicateReview";
import { KIND_LABELS, isKind } from "@/lib/curation/kind";
import { adminPanelSx } from "./AdminUi";

function SideCard({ side, testId }: { side: ReviewSide; testId: string }) {
  const ids = [side.anilistId !== null ? `AniList ${side.anilistId}` : null, side.anidbId !== null ? `AniDB ${side.anidbId}` : null].filter(Boolean).join(" · ");
  const meta = [side.kind && isKind(side.kind) ? KIND_LABELS[side.kind] : null, side.seasonLabel, side.episodes ? `${side.episodes} ep.` : null].filter(Boolean).join(" · ");
  return (
    <Stack direction="row" spacing={1.5} data-testid={testId} sx={{ flex: 1, minWidth: 240 }}>
      <Box sx={{ width: 56, height: 80, borderRadius: 1, bgcolor: "action.hover", flexShrink: 0, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {side.coverImage && <img src={side.coverImage} alt="" width={56} height={80} style={{ objectFit: "cover" }} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, overflowWrap: "anywhere" }}>{side.title}</Typography>
        {side.titleEnglish && <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>{side.titleEnglish}</Typography>}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{meta || "sem detalhes"}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{ids}</Typography>
      </Box>
    </Stack>
  );
}

/**
 * Admin → Curadoria → obras repetidas: cada par que a auditoria suspeita ser a mesma obra, lado a lado. "É a mesma obra" junta
 * (só quando uma das duas é a cópia do AniDB sem página: ela passa a ser a obra da AniList) e "Não é a mesma obra" tira o par
 * da lista para sempre.
 */
export function DuplicatesPanel() {
  const [pairs, setPairs] = useState<ReviewPair[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/duplicates", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setPairs(((await res.json()) as { pairs: ReviewPair[] }).pairs);
    } catch {
      setMessage({ severity: "error", text: "Não consegui carregar as obras repetidas." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(pair: ReviewPair, body: Record<string, unknown>, done: string) {
    setBusy(pair.key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/duplicates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error?: string };
      setMessage(res.ok ? { severity: "success", text: done } : { severity: "error", text: json.error ?? "Não foi possível concluir." });
      await load();
    } catch {
      setMessage({ severity: "error", text: "Não consegui falar com o servidor." });
    } finally {
      setBusy(null);
    }
  }

  if (pairs === null) return <Typography data-testid="duplicates-loading">{message?.text ?? "Carregando as obras repetidas…"}</Typography>;

  return (
    <Box component="section" sx={adminPanelSx} data-testid="duplicates-panel">
      <Typography component="h2" sx={{ fontSize: 20 }}>
        Obras repetidas para revisar ({pairs.length})
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Pares que a auditoria acha que são a mesma obra. Juntar só é possível quando uma delas é a cópia do AniDB sem página; nos demais casos, confira e marque que não é a mesma.
      </Typography>
      {message && <Alert severity={message.severity} data-testid="duplicates-message">{message.text}</Alert>}
      {pairs.length === 0 && <Typography data-testid="duplicates-empty" sx={{ fontSize: 14 }}>Nenhuma obra repetida para revisar.</Typography>}
      {pairs.map((pair) => (
        <Box key={pair.key} data-testid="duplicates-pair" sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2, borderRadius: "12px", border: 1, borderColor: "divider" }}>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 2 }}>
            <SideCard side={pair.left} testId="duplicates-left" />
            <SideCard side={pair.right} testId="duplicates-right" />
          </Stack>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{pair.reason}</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }}>
            {pair.merge && (
              <Button variant="contained" size="small" disabled={busy === pair.key} data-testid="duplicates-merge" onClick={() => void decide(pair, { action: "merge", ...pair.merge }, "Obras juntadas: a cópia do AniDB passou a ser a obra da AniList.")}>
                É a mesma obra — juntar
              </Button>
            )}
            <Button variant="outlined" size="small" disabled={busy === pair.key} data-testid="duplicates-dismiss" onClick={() => void decide(pair, { action: "dismiss", entryIds: [pair.left.entryId, pair.right.entryId] }, "Par marcado como obras diferentes.")}>
              Não é a mesma obra
            </Button>
          </Stack>
        </Box>
      ))}
    </Box>
  );
}
