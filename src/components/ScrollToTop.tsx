"use client";

import { useEffect, useState } from "react";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { Fab, Zoom } from "@mui/material";
import { usePathname } from "next/navigation";

/** Rolou mais que isto (px) e o botão aparece. */
const SHOW_AFTER = 600;

/**
 * Botão flutuante no canto: aparece quando a pessoa já desceu a página e leva
 * de volta ao topo. Respeita "reduzir movimento" (rola sem animação). Fica de
 * fora da área Admin, que tem a própria casca.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  function toTop() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <Zoom in={visible}>
      <Fab
        onClick={toTop}
        aria-label="Voltar ao topo"
        data-testid="scroll-to-top"
        tabIndex={visible ? 0 : -1}
        sx={{ position: "fixed", right: 24, bottom: 24, zIndex: 1200, bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } }}
      >
        <KeyboardArrowUpIcon />
      </Fab>
    </Zoom>
  );
}
