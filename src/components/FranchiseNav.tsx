"use client";

import { useEffect, useRef } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, IconButton, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { kindLabel } from "@/components/BranchCard";
import type { FranchiseStep } from "@/lib/curation/franchiseTimelineLoader";

const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
const ITEM_W = 176;
const DOT = 14;

const labelOf = (step: FranchiseStep) => (step.role === "MAIN" ? `Temporada ${step.season ?? ""}`.trim() : step.role === "RELATED" ? "Série relacionada" : kindLabel(step.kind));
const whenOf = (step: FranchiseStep) => (step.seasonName && step.seasonYear ? `${SEASON_LABEL[step.seasonName] ?? step.seasonName} ${step.seasonYear}` : step.seasonYear ? String(step.seasonYear) : null);

function NavRow({ step }: { step: FranchiseStep }) {
  const title = step.titleNative ?? step.titleRomaji;
  const when = whenOf(step);
  const body = (
    <>
      <Typography component="span" sx={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: step.role === "SPECIAL" ? "secondary.light" : "primary.light" }}>
        {labelOf(step)}
        {step.role === "SPECIAL" ? " · opcional" : ""}
        {when ? ` · ${when}` : ""}
      </Typography>
      <Typography component="span" className="nav-title" lang={step.titleNative ? "ja" : undefined} sx={{ display: "block", fontSize: 14, fontWeight: step.current ? 700 : 500, overflowWrap: "anywhere" }}>
        {title}
        {step.current && <span style={{ fontWeight: 400, opacity: 0.7 }}> · você está aqui</span>}
      </Typography>
    </>
  );
  if (step.current) return <Box aria-current="page">{body}</Box>;
  return (
    <AppLink href={`/anime/${step.anilistId}`} underline="none" color="inherit" sx={{ display: "block", borderRadius: 1, "&:hover .nav-title, &:focus-visible .nav-title": { textDecoration: "underline" }, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}>
      {body}
    </AppLink>
  );
}

const dotSx = (step: FranchiseStep) => ({
  position: "absolute" as const,
  left: 5,
  top: step.role === "SPECIAL" ? 32 : 5,
  width: DOT,
  height: DOT,
  borderRadius: "50%",
  boxSizing: "border-box" as const,
  border: 2,
  borderColor: step.role === "SPECIAL" ? "secondary.main" : "primary.main",
  bgcolor: step.current ? "background.paper" : step.role === "SPECIAL" ? "background.default" : "primary.main",
  boxShadow: step.current ? "0 0 0 4px rgba(228, 0, 43, 0.28)" : "none",
});

/**
 * Navegação da franquia (Epic 47): as temporadas, OVA, ODA e filmes da obra numa linha do tempo horizontal, em ordem de estreia,
 * que leva à descrição de cada um. As temporadas correm pela linha; os especiais descem dela num ramo e são opcionais. A faixa
 * rola de lado (com os botões ou o dedo) e já abre centralizada na obra atual. Vai junto da sinopse.
 */
export function FranchiseNav({ steps }: { steps: FranchiseStep[] | null }) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scroller.current;
    const current = box?.querySelector<HTMLElement>('[aria-current="page"]')?.closest("li");
    if (box && current) box.scrollLeft = current.offsetLeft - box.clientWidth / 2 + current.offsetWidth / 2;
  }, [steps]);

  if (!steps || steps.length < 2) return null;
  const main = steps.filter((s) => s.role === "MAIN").length;
  const specials = steps.filter((s) => s.role === "SPECIAL").length;
  const scrollBy = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <Box component="nav" aria-label="Navegar pela franquia" data-testid="franchise-nav" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: "16px", bgcolor: "background.paper", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>
            Navegue pela franquia
          </Typography>
          <Typography data-testid="franchise-nav-summary" sx={{ fontSize: 13, color: "text.secondary" }}>
            {main} {main === 1 ? "temporada" : "temporadas"}
            {specials > 0 ? ` e ${specials} ${specials === 1 ? "especial (OVA, ODA ou filme)" : "especiais (OVA, ODA e filmes)"}` : ""}, em ordem de estreia.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexShrink: 0 }}>
          <IconButton size="small" aria-label="Ver as obras anteriores" onClick={() => scrollBy(-ITEM_W * 2)}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton size="small" aria-label="Ver as obras seguintes" onClick={() => scrollBy(ITEM_W * 2)}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>

      <Box ref={scroller} data-testid="franchise-nav-scroller" sx={{ overflowX: "auto", pb: 1, scrollSnapType: "x proximity", minWidth: 0, maxWidth: "100%" }}>
        <Box component="ol" aria-label="Temporadas, OVA, ODA e filmes da franquia" sx={{ display: "flex", listStyle: "none", m: 0, p: 0, width: "max-content" }}>
          {steps.map((step) => (
            <Box
              component="li"
              key={step.anilistId}
              data-testid={`franchise-nav-item-${step.anilistId}`}
              data-branch={step.role === "SPECIAL" ? "true" : undefined}
              data-role={step.role}
              data-current={step.current ? "true" : undefined}
              sx={{
                position: "relative",
                flex: `0 0 ${ITEM_W}px`,
                boxSizing: "border-box",
                pr: 2,
                pt: step.role === "SPECIAL" ? "58px" : "34px",
                scrollSnapAlign: "center",
                // A linha principal passa por todos os itens (também pelos dos ramos).
                "&::before": { content: '""', position: "absolute", top: 11, left: 0, right: 0, height: 2, bgcolor: "divider" },
                "&:first-of-type::before": { left: 12 },
                "&:last-of-type::before": { right: "auto", width: 12 },
                "&:only-child::before": { display: "none" },
              }}
            >
              {step.role === "SPECIAL" && <Box aria-hidden sx={{ position: "absolute", left: 11, top: 12, width: 2, height: 22, bgcolor: "secondary.main", opacity: 0.7 }} />}
              <Box aria-hidden sx={dotSx(step)} />
              <NavRow step={step} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
