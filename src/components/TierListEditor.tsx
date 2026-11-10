"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Alert, Box, Button, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { TIERS, type Tier, type TierWork } from "@/lib/tierListTypes";

const TIER_COLORS: Record<Tier, string> = { S: "#ff164f", A: "#ff8a3d", B: "#ffd400", C: "#4fc3a1", D: "#6b8cff" };
type Tiers = Record<Tier, string[]>;

/**
 * Tier list da temporada: toque numa obra e depois num tier (funciona igual no celular e no computador, sem arrastar);
 * "Salvar" guarda, "Publicar no Feed" vira uma publicação com a #tierlist.
 */
export function TierListEditor({ season, seasonYear, works, initial, initialPostId }: { season: string; seasonYear: number; works: TierWork[]; initial: Tiers; initialPostId: string | null }) {
  const [tiers, setTiers] = useState<Tiers>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [postId, setPostId] = useState(initialPostId);
  const [busy, setBusy] = useState(false);
  const byKey = new Map(works.map((w) => [w.key, w]));
  const placed = new Set(TIERS.flatMap((t) => tiers[t]));
  const unplaced = works.filter((w) => !placed.has(w.key));

  function place(tier: Tier | null) {
    if (!selected) return;
    setTiers((current) => {
      const next = Object.fromEntries(TIERS.map((t) => [t, current[t].filter((k) => k !== selected)])) as Tiers;
      if (tier) next[tier] = [...next[tier], selected];
      return next;
    });
    setSelected(null);
  }

  async function save(): Promise<boolean> {
    const res = await fetch("/api/tier-lists", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ season, seasonYear, tiers }) });
    if (!res.ok) setMessage({ kind: "error", text: "Não foi possível salvar." });
    return res.ok;
  }

  async function run(publish: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      if (!(await save())) return;
      if (!publish) {
        setMessage({ kind: "success", text: "Tier list salva." });
        return;
      }
      const res = await fetch("/api/tier-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ season, seasonYear }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Não foi possível publicar." });
        return;
      }
      setPostId(data.postId);
      setMessage({ kind: "success", text: "Publicada no Feed." });
    } finally {
      setBusy(false);
    }
  }

  const chip = (key: string) => {
    const w = byKey.get(key);
    if (!w) return null;
    const active = selected === key;
    return (
      <Box
        key={key}
        component="button"
        type="button"
        onClick={() => setSelected(active ? null : key)}
        aria-pressed={active}
        data-testid={`tier-work-${key}`}
        title={w.titleRomaji}
        sx={{ width: 72, border: 2, borderColor: active ? "secondary.main" : "transparent", borderRadius: "8px", p: 0, bgcolor: "background.paper", color: "text.primary", cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" } }}
      >
        <Box sx={{ position: "relative", width: "100%", aspectRatio: "2 / 3", bgcolor: "#171820" }}>{w.coverImage && <CoverImage src={w.coverImage} sizes="72px" />}</Box>
        <Typography component="span" sx={{ fontSize: 10, lineHeight: 1.2, p: 0.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textAlign: "left" }}>
          {w.titleRomaji}
        </Typography>
      </Box>
    );
  };

  if (works.length === 0) {
    return <Typography sx={{ color: "text.secondary" }}>Você não acompanha nenhuma obra desta temporada. Acompanhe obras em Explorar para montar a tier list.</Typography>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="tier-list">
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{selected ? "Agora toque no tier onde ela vai (ou em “Tirar do tier”)." : "Toque numa obra e depois num tier."}</Typography>
      {TIERS.map((tier) => (
        <Box key={tier} sx={{ display: "flex", border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden", minHeight: 96 }}>
          <Box
            component="button"
            type="button"
            onClick={() => place(tier)}
            disabled={!selected}
            data-testid={`tier-${tier}`}
            aria-label={`Colocar no tier ${tier}`}
            sx={{ flex: "0 0 56px", border: 0, bgcolor: TIER_COLORS[tier], color: "#08080b", fontSize: 28, fontWeight: 800, cursor: selected ? "pointer" : "default" }}
          >
            {tier}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1, flex: 1, minWidth: 0 }}>{tiers[tier].map(chip)}</Box>
        </Box>
      ))}
      <Box sx={{ border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: "12px", p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Sem tier ({unplaced.length})</Typography>
          <Button size="small" onClick={() => place(null)} disabled={!selected}>
            Tirar do tier
          </Button>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>{unplaced.map((w) => chip(w.key))}</Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="outlined" onClick={() => void run(false)} disabled={busy} data-testid="tier-save">
          Salvar
        </Button>
        <Button variant="contained" onClick={() => void run(true)} disabled={busy} data-testid="tier-publish">
          Publicar no Feed
        </Button>
        {postId && (
          <Button component={NextLink} href={`/publicacao/${postId}`} size="small">
            Ver publicação
          </Button>
        )}
      </Box>
      {message && (
        <Alert severity={message.kind} role="status" data-testid="tier-message">
          {message.text}
        </Alert>
      )}
    </Box>
  );
}
