"use client";

import { useState } from "react";
import { Box, Tab, Tabs, Typography, useMediaQuery } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import type { CompareWork } from "@/lib/listCompare";

type Column = "common" | "mine" | "theirs";

function Score({ value, label }: { value: number | null; label: string }) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 52 }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.2 }}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: value === null ? "text.disabled" : "text.primary" }}>{value ?? "–"}</Typography>
    </Box>
  );
}

function Row({ w, firstName, column }: { w: CompareWork; firstName: string; column: Column }) {
  const gap = w.myScore !== null && w.theirScore !== null ? Math.abs(w.myScore - w.theirScore) : null;
  const title = (
    <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.title}</Typography>
  );
  return (
    <Box component="li" data-testid={`compare-${column}-item`} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ position: "relative", width: 40, flexShrink: 0, aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>{w.coverImage && <CoverImage src={w.coverImage} sizes="40px" />}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {w.href ? (
          <AppLink href={w.href} underline="hover" sx={{ color: "text.primary" }}>
            {title}
          </AppLink>
        ) : (
          title
        )}
        {gap !== null && gap >= 3 && (
          <Typography sx={{ fontSize: 12, color: "warning.main" }} data-testid="compare-gap">
            {gap} pontos de diferença: assunto para conversar
          </Typography>
        )}
      </Box>
      {column !== "theirs" && <Score value={w.myScore} label="você" />}
      {column !== "mine" && <Score value={w.theirScore} label={firstName} />}
    </Box>
  );
}

/** As três colunas da comparação; no celular e no tablet, abas (uma coluna por vez). */
export function ListCompareView({ firstName, common, onlyMine, onlyTheirs }: { firstName: string; common: CompareWork[]; onlyMine: CompareWork[]; onlyTheirs: CompareWork[] }) {
  const [tab, setTab] = useState<Column>("common");
  // Uma versão só na página: colunas lado a lado no computador, abas no celular e no tablet.
  const wide = useMediaQuery("(min-width:1200px)");
  const lists: Record<Column, { label: string; items: CompareWork[]; empty: string }> = {
    common: { label: `Em comum · ${common.length}`, items: common, empty: "Nenhuma obra em comum ainda." },
    mine: { label: `Só você · ${onlyMine.length}`, items: onlyMine, empty: `Tudo o que você acompanha, ${firstName} também acompanha.` },
    theirs: { label: `Só ${firstName} · ${onlyTheirs.length}`, items: onlyTheirs, empty: `Tudo o que ${firstName} acompanha, você também acompanha.` },
  };
  const column = (key: Column) => (
    <Box key={key} sx={{ minWidth: 0 }}>
      {wide && (
        <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>
          {lists[key].label}
        </Typography>
      )}
      {lists[key].items.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{lists[key].empty}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {lists[key].items.map((w) => (
            <Row key={w.key} w={w} firstName={firstName} column={key} />
          ))}
        </Box>
      )}
    </Box>
  );
  return (
    <Box data-testid="list-compare">
      {wide ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 4 }}>{(Object.keys(lists) as Column[]).map(column)}</Box>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v: Column) => setTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label="Comparação das listas" sx={{ mb: 2 }}>
            {(Object.keys(lists) as Column[]).map((k) => (
              <Tab key={k} value={k} label={lists[k].label} data-testid={`compare-tab-${k}`} />
            ))}
          </Tabs>
          {column(tab)}
        </>
      )}
    </Box>
  );
}
