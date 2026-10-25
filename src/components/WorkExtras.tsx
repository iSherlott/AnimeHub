"use client";

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useTitlePreference } from "@/lib/titlePreference";
import { EXTRA_KINDS, type ExtraKind, type ExtraView } from "@/lib/episodeExtrasView";

const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/**
 * Extras da obra (AniDB): especiais, aberturas e encerramentos, trailers… numa seção própria, fora da sequência de
 * episódios — não contam como episódio lançado. Vem minimizada; o título segue o idioma escolhido pela pessoa.
 */
export function WorkExtras({ extras }: { extras: ExtraView[] }) {
  const { language, japaneseScript } = useTitlePreference().preference;
  const [open, setOpen] = useState(false);
  if (extras.length === 0) return null;
  const groups = new Map<ExtraKind, ExtraView[]>();
  for (const e of extras) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]);
  const native = language === "ja" && japaneseScript !== "romaji";
  const titleOf = (e: ExtraView) => (native ? e.titleJa : language === "ja" ? e.title : e.titleEn) ?? e.title ?? e.titleEn ?? e.titleJa;

  return (
    <Box component="section" aria-labelledby="work-extras-heading" data-testid="work-extras" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography id="work-extras-heading" component="h2" sx={{ fontSize: 22, lineHeight: 1.5 }}>
          Extras
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          {[...groups.entries()].map(([kind, list]) => `${EXTRA_KINDS[kind]}: ${list.length}`).join(" · ")}
        </Typography>
        <Button size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="work-extras-toggle">
          {open ? "Minimizar extras" : "Mostrar extras"}
        </Button>
      </Box>
      {open &&
        [...groups.entries()].map(([kind, list]) => (
          <Box key={kind} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }} data-testid={`work-extras-${kind}`}>
            <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700 }}>
              {EXTRA_KINDS[kind]}
            </Typography>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
              {list.map((e) => {
                const title = titleOf(e);
                return (
                  <Box component="li" key={e.id} data-testid={`work-extra-${e.code}`} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.25, bgcolor: "background.paper" }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                      {e.code}
                      {title && (
                        <Box component="span" lang={native && e.titleJa ? "ja" : undefined} sx={{ fontWeight: 400 }}>
                          {" · "}
                          {title}
                        </Box>
                      )}
                    </Typography>
                    {e.airDate && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{dayFmt.format(new Date(`${e.airDate}T00:00:00Z`))}</Typography>}
                    {e.synopsis && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{e.synopsis}</Typography>}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
    </Box>
  );
}
