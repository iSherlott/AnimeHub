"use client";

import { useEffect, useState } from "react";
import { Box } from "@mui/material";

export type WorkSection = { id: string; label: string };

/**
 * Atalhos das seções da página da obra (Epic 49): uma barra que acompanha a rolagem, com um link para cada seção que existe na
 * página (visão geral, franquia, episódios, elenco, comunidade…) e o destaque da seção que está na tela. Seção sem conteúdo na
 * página não aparece na barra.
 */
export function WorkSectionNav({ sections }: { sections: WorkSection[] }) {
  const [present, setPresent] = useState<string[] | null>(null);
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const found = sections.filter((s) => document.getElementById(s.id)).map((s) => s.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresent(found);
    if (found.length === 0) return;
    const elements = found.map((id) => document.getElementById(id) as HTMLElement);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-160px 0px -60% 0px", threshold: 0 }
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  const shown = present === null ? sections : sections.filter((s) => present.includes(s.id));
  if (shown.length < 2) return null;

  return (
    <Box
      component="nav"
      aria-label="Seções da obra"
      data-testid="work-section-nav"
      sx={{ position: "sticky", top: 88, zIndex: 5, bgcolor: "background.default", borderBottom: 1, borderColor: "divider", px: { xs: 3, sm: 5 }, mt: 3, overflowX: "auto" }}
    >
      <Box component="ul" sx={{ display: "flex", gap: 0.5, listStyle: "none", m: 0, p: 0, width: "max-content" }}>
        {shown.map((section) => (
          <Box component="li" key={section.id}>
            <Box
              component="a"
              href={`#${section.id}`}
              data-testid={`section-link-${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
              onClick={() => setActive(section.id)}
              sx={{
                display: "block",
                px: 1.75,
                py: 1.5,
                fontSize: 14,
                fontWeight: 700,
                color: active === section.id ? "text.primary" : "text.secondary",
                textDecoration: "none",
                borderBottom: 2,
                borderColor: active === section.id ? "primary.main" : "transparent",
                "&:hover": { color: "text.primary" },
                "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: -2 },
              }}
            >
              {section.label}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
