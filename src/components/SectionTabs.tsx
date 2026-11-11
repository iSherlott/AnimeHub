import { Box } from "@mui/material";
import { AppLink } from "@/components/AppLink";

export type SectionTab = { key: string; label: string; href: string };

/**
 * Abas de uma seção (cada aba é uma página): as de Comunidades (Minhas, Explorar, Eventos) e as da Temporada (Tier list,
 * Bolão, Aberturas, Retrospectiva). Rolam de lado no celular em vez de quebrar a linha.
 */
export function SectionTabs({ label, tabs, active, testId }: { label: string; tabs: SectionTab[]; active: string; testId: string }) {
  return (
    <Box
      component="nav"
      aria-label={label}
      data-testid={testId}
      sx={{ display: "flex", gap: 3, borderBottom: 1, borderColor: "divider", overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
    >
      {tabs.map((t) => (
        <AppLink
          key={t.key}
          href={t.href}
          underline="none"
          aria-current={active === t.key ? "page" : undefined}
          data-testid={`${testId}-${t.key}`}
          sx={{ pb: 1.25, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, color: active === t.key ? "text.primary" : "text.secondary", borderBottom: 2, borderColor: active === t.key ? "primary.main" : "transparent", mb: "-1px", "&:hover": { color: "text.primary" } }}
        >
          {t.label}
        </AppLink>
      ))}
    </Box>
  );
}

/** Abas de Comunidades que são outras páginas (a agenda de eventos de anime). */
export const COMMUNITY_EXTRA_TABS: SectionTab[] = [{ key: "eventos", label: "Eventos", href: "/eventos" }];

/** As telas da temporada, juntas numa seção (antes ficavam soltas no menu da conta). */
export const SEASON_TABS: SectionTab[] = [
  { key: "tier-list", label: "Tier list", href: "/tier-list" },
  { key: "bolao", label: "Bolão", href: "/bolao" },
  { key: "aberturas", label: "Aberturas", href: "/aberturas" },
  { key: "personagens", label: "Personagens", href: "/personagens" },
  { key: "retrospectiva", label: "Retrospectiva", href: "/retrospectiva" },
];

export function SeasonTabs({ active }: { active: string }) {
  return <SectionTabs label="Temporada" tabs={SEASON_TABS} active={active} testId="season-tabs" />;
}
