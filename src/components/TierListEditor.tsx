"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import NextLink from "next/link";
import { Alert, Box, Button, Typography } from "@mui/material";
import { TierLetter, TierRowFrame, TierWorkFace } from "@/components/TierListBoard";
import { moveWork, TIERS, type Tier, type TierWork, type TierZone as Zone } from "@/lib/tierListTypes";

type Tiers = Record<Tier, string[]>;
type Drag = { key: string; x: number; y: number; zone: Zone | null };

const MOUSE_START_PX = 5;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP_PX = 8;
/** Faixa perto da borda que rola a página durante o arrasto; em cima ela é maior por causa do cabeçalho fixo. */
const EDGE_TOP_PX = 120;
const EDGE_BOTTOM_PX = 72;

/** Quem rola a página: o app rola num contêiner (não na janela); sem nenhum, a própria página. */
function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** O ponto (x, y) está sobre qual faixa e antes de qual obra dela. */
function dropTarget(x: number, y: number, dragged: string): { zone: Zone | null; beforeKey: string | null; self: boolean } {
  const el = document.elementFromPoint(x, y);
  const zoneEl = el?.closest<HTMLElement>("[data-tier-drop]");
  const zone = (zoneEl?.dataset.tierDrop as Zone | undefined) ?? null;
  const workEl = el?.closest<HTMLElement>("[data-tier-key]");
  let beforeKey = workEl && zoneEl?.contains(workEl) ? (workEl.dataset.tierKey ?? null) : null;
  // Soltou em cima dela mesma: fica onde estava.
  if (beforeKey === dragged) return { zone, beforeKey: null, self: true };
  if (beforeKey && workEl) {
    // Na metade direita da capa, cai depois dela.
    const box = workEl.getBoundingClientRect();
    if (x > box.left + box.width / 2) beforeKey = (workEl.nextElementSibling as HTMLElement | null)?.dataset.tierKey ?? null;
  }
  return { zone, beforeKey: beforeKey === dragged ? null : beforeKey, self: false };
}

/**
 * Tier list da temporada: arraste cada obra até o tier (no celular, segure a capa um instante e arraste) — ou toque
 * na obra e depois no tier, que também funciona pelo teclado. "Salvar" guarda, "Publicar no Feed" vira uma
 * publicação com o mesmo quadro e a #tierlist.
 */
export function TierListEditor({ season, seasonYear, works, initial, initialPostId }: { season: string; seasonYear: number; works: TierWork[]; initial: Tiers; initialPostId: string | null }) {
  const [tiers, setTiers] = useState<Tiers>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [postId, setPostId] = useState(initialPostId);
  const [busy, setBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  /** Depois de soltar, o navegador ainda manda um clique na capa: ele não pode virar "selecionar". */
  const swallowClick = useRef(false);
  const byKey = new Map(works.map((w) => [w.key, w]));
  const placed = new Set(TIERS.flatMap((t) => tiers[t]));
  const unplaced = works.filter((w) => !placed.has(w.key));

  // No toque, segurar e arrastar não pode rolar a página: o touchmove precisa estar registrado (não passivo) antes do
  // dedo encostar, senão o navegador já decidiu rolar.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    board.addEventListener("touchmove", block, { passive: false });
    return () => board.removeEventListener("touchmove", block);
  }, []);

  function place(tier: Tier | null) {
    if (!selected) return;
    setTiers((current) => moveWork(current, selected, tier ?? "none", null));
    setSelected(null);
  }

  function startPointer(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const touch = e.pointerType !== "mouse";
    let last = { x: startX, y: startY };
    let active = false;
    let frame = 0;
    const timer = touch ? window.setTimeout(() => begin(), TOUCH_HOLD_MS) : 0;
    const scroller = scrollParent(boardRef.current);

    function update(x: number, y: number) {
      const { zone } = dropTarget(x, y, key);
      const next = { key, x, y, zone };
      dragRef.current = next;
      setDrag(next);
    }
    function begin() {
      active = true;
      setSelected(null);
      if (touch) navigator.vibrate?.(15);
      update(last.x, last.y);
      frame = requestAnimationFrame(autoScroll);
    }
    // Perto da borda da área que rola, ela rola sozinha (o S fica lá em cima, o "sem tier" lá embaixo).
    function autoScroll() {
      if (!active) return;
      const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
      const box = isPage ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const top = Math.max(box.top, 0) + EDGE_TOP_PX;
      const bottom = Math.min(box.bottom, window.innerHeight) - EDGE_BOTTOM_PX;
      const dy = last.y < top ? -Math.ceil((top - last.y) / 4) : last.y > bottom ? Math.ceil((last.y - bottom) / 4) : 0;
      if (dy) {
        scroller.scrollBy(0, dy);
        update(last.x, last.y);
      }
      frame = requestAnimationFrame(autoScroll);
    }
    function onMove(ev: PointerEvent) {
      last = { x: ev.clientX, y: ev.clientY };
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!active) {
        if (touch && moved > TOUCH_SLOP_PX) return finish(false); // Era rolagem, não arrasto.
        if (!touch && moved > MOUSE_START_PX) begin();
        return;
      }
      update(last.x, last.y);
    }
    function onUp(ev: PointerEvent) {
      last = { x: ev.clientX, y: ev.clientY };
      finish(true);
    }
    function onCancel() {
      finish(false);
    }
    function finish(drop: boolean) {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (active) {
        swallowClick.current = true;
        window.setTimeout(() => (swallowClick.current = false), 0);
        if (drop) {
          const { zone, beforeKey, self } = dropTarget(last.x, last.y, key);
          if (zone && !self) setTiers((current) => moveWork(current, key, zone, beforeKey));
        }
      }
      active = false;
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
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
    const dragging = drag?.key === key;
    return (
      <Box
        key={key}
        component="button"
        type="button"
        onClick={() => {
          if (swallowClick.current) return;
          setSelected(active ? null : key);
        }}
        onPointerDown={(e: ReactPointerEvent<HTMLElement>) => startPointer(e, key)}
        onDragStart={(e: DragEvent) => e.preventDefault()}
        onContextMenu={(e: MouseEvent) => e.preventDefault()}
        aria-pressed={active}
        data-testid={`tier-work-${key}`}
        data-tier-key={key}
        title={w.titleRomaji}
        sx={{
          width: { xs: 64, sm: 72 },
          border: 2,
          borderColor: active ? "secondary.main" : "transparent",
          borderRadius: "8px",
          p: 0,
          bgcolor: "background.paper",
          color: "text.primary",
          cursor: drag ? "grabbing" : "grab",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          opacity: dragging ? 0.35 : 1,
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" },
        }}
      >
        <TierWorkFace title={w.titleRomaji} cover={w.coverImage} />
      </Box>
    );
  };

  if (works.length === 0) {
    return <Typography sx={{ color: "text.secondary" }}>Você não acompanha nenhuma obra desta temporada. Acompanhe obras em Explorar para montar a tier list.</Typography>;
  }

  const dragged = drag ? byKey.get(drag.key) : null;

  return (
    <Box ref={boardRef} sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="tier-list">
      <Typography sx={{ fontSize: 14, color: "text.secondary" }} aria-live="polite">
        {selected ? "Agora toque no tier onde ela vai (ou em “Tirar do tier”)." : "Arraste cada obra até o tier — no celular, segure a capa e arraste. Também dá para tocar na obra e depois no tier."}
      </Typography>
      {TIERS.map((tier) => (
        <TierRowFrame
          key={tier}
          tier={tier}
          dropZone={tier}
          highlighted={drag?.zone === tier}
          label={
            <Box
              component="button"
              type="button"
              onClick={() => place(tier)}
              disabled={!selected}
              data-testid={`tier-${tier}`}
              aria-label={`Colocar no tier ${tier}`}
              sx={{ display: "flex", flex: "0 0 56px", border: 0, p: 0, cursor: selected ? "pointer" : "default", "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" } }}
            >
              <TierLetter tier={tier} />
            </Box>
          }
        >
          {tiers[tier].map(chip)}
        </TierRowFrame>
      ))}
      <Box
        data-tier-drop="none"
        data-testid="tier-unplaced"
        sx={{ border: 1, borderStyle: "dashed", borderColor: drag?.zone === "none" ? "secondary.main" : "divider", bgcolor: drag?.zone === "none" ? "action.hover" : "transparent", borderRadius: "12px", p: 1, display: "flex", flexDirection: "column", gap: 1 }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Sem tier ({unplaced.length})</Typography>
          <Button size="small" onClick={() => place(null)} disabled={!selected}>
            Tirar do tier
          </Button>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, minHeight: 48 }}>{unplaced.map((w) => chip(w.key))}</Box>
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
      {/* A capa que acompanha o dedo/mouse durante o arrasto. */}
      {drag && dragged && (
        <Box
          aria-hidden
          data-testid="tier-drag-ghost"
          sx={{ position: "fixed", left: drag.x, top: drag.y, width: 72, transform: "translate(-50%, -60%) rotate(-3deg)", pointerEvents: "none", zIndex: 2000, borderRadius: "8px", overflow: "hidden", bgcolor: "background.paper", boxShadow: 8, display: "flex", flexDirection: "column", border: 2, borderColor: "secondary.main" }}
        >
          <TierWorkFace title={dragged.titleRomaji} cover={dragged.coverImage} />
        </Box>
      )}
    </Box>
  );
}
