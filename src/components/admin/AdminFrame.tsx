"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import JoinInnerOutlinedIcon from "@mui/icons-material/JoinInnerOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import RadarOutlinedIcon from "@mui/icons-material/RadarOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import SyncAltOutlinedIcon from "@mui/icons-material/SyncAltOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuIcon from "@mui/icons-material/Menu";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import { can, type Permission } from "@/lib/auth/permissions";

type NavItem = { href: string; label: string; icon: ReactNode; crumb: string; perm?: Permission; group: GroupKey };
type GroupKey = "inicio" | "visao" | "catalogo" | "episodios" | "fontes" | "curadoria" | "comunidade";

/** Grupos do menu (cada um abre e fecha); o do item aberto começa aberto. "Dashboard" fica fora, sempre à vista. */
const GROUPS: Array<{ key: Exclude<GroupKey, "inicio">; label: string }> = [
  { key: "visao", label: "Visão geral" },
  { key: "catalogo", label: "Catálogo" },
  { key: "episodios", label: "Episódios e agenda" },
  { key: "fontes", label: "Fontes e dados" },
  { key: "curadoria", label: "Curadoria" },
  { key: "comunidade", label: "Comunidade e acesso" },
];

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <DashboardOutlinedIcon />, crumb: "DASHBOARD", group: "inicio" },
  { href: "/admin/saude", label: "Saúde do catálogo", icon: <MonitorHeartOutlinedIcon />, crumb: "SAÚDE DO CATÁLOGO", group: "visao" },
  { href: "/admin/jobs", label: "Jobs", icon: <AccountTreeOutlinedIcon />, crumb: "JOBS", group: "visao" },
  { href: "/admin/logs", label: "Logs", icon: <FilterListOutlinedIcon />, crumb: "LOGS", group: "visao" },
  { href: "/admin/obras", label: "Catálogo de obras", icon: <MovieFilterOutlinedIcon />, crumb: "CATÁLOGO DE OBRAS", group: "catalogo" },
  { href: "/admin/catalogo", label: "Produções e franquias", icon: <LibraryBooksOutlinedIcon />, crumb: "PRODUÇÕES E FRANQUIAS", group: "catalogo" },
  { href: "/admin/franquias", label: "Franquias", icon: <TimelineOutlinedIcon />, crumb: "FRANQUIAS", group: "catalogo" },
  { href: "/admin/taxonomia", label: "Taxonomia", icon: <CategoryOutlinedIcon />, crumb: "TAXONOMIA", group: "catalogo" },
  { href: "/admin/traducoes", label: "Traduções", icon: <TranslateOutlinedIcon />, crumb: "TRADUÇÕES", group: "catalogo" },
  { href: "/admin/episodios", label: "Episódios", icon: <VideoLibraryOutlinedIcon />, crumb: "EPISÓDIOS", group: "episodios" },
  { href: "/admin/calendario", label: "Calendário", icon: <CalendarMonthOutlinedIcon />, crumb: "CALENDÁRIO", group: "episodios" },
  { href: "/admin/overrides", label: "Overrides", icon: <EditOutlinedIcon />, crumb: "OVERRIDES", group: "episodios" },
  { href: "/admin/conflitos", label: "Conflitos", icon: <WarningAmberOutlinedIcon />, crumb: "CONFLITOS", group: "episodios" },
  { href: "/admin/importacoes", label: "Importações", icon: <FileDownloadOutlinedIcon />, crumb: "IMPORTAÇÕES", group: "fontes" },
  { href: "/admin/atualizacoes", label: "Atualização seletiva", icon: <SyncAltOutlinedIcon />, crumb: "ATUALIZAÇÃO SELETIVA", group: "fontes" },
  { href: "/admin/correspondencias", label: "Correspondências", icon: <JoinInnerOutlinedIcon />, crumb: "CORRESPONDÊNCIAS", group: "fontes" },
  { href: "/admin/match-name", label: "Match name", icon: <LinkOutlinedIcon />, crumb: "MATCH NAME", group: "fontes" },
  { href: "/admin/matching", label: "Matching", icon: <CompareArrowsOutlinedIcon />, crumb: "MATCHING", group: "fontes" },
  { href: "/admin/scrapers", label: "Scrapers", icon: <RadarOutlinedIcon />, crumb: "SCRAPERS", group: "fontes" },
  { href: "/admin/curadoria", label: "Curadoria", icon: <FactCheckOutlinedIcon />, crumb: "CURADORIA", group: "curadoria" },
  { href: "/admin/pendencias", label: "Pendências", icon: <RuleOutlinedIcon />, crumb: "PENDÊNCIAS", group: "curadoria" },
  { href: "/admin/quizzes", label: "Quizzes", icon: <QuizOutlinedIcon />, crumb: "QUIZZES", group: "comunidade" },
  { href: "/admin/acesso", label: "Acesso e moderação", icon: <AdminPanelSettingsOutlinedIcon />, crumb: "ACESSO E MODERAÇÃO", perm: "moderation", group: "comunidade" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

const linkSx = (active: boolean) => ({
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  px: 1.5,
  py: 1,
  minHeight: 40,
  boxSizing: "border-box",
  borderRadius: "10px",
  fontSize: 14,
  color: active ? "text.primary" : "text.secondary",
  bgcolor: active ? "#2c111b" : "transparent",
  textDecoration: "none",
  "& svg": { fontSize: 19, color: active ? "primary.main" : "text.secondary" },
  "&:hover": { color: "text.primary", bgcolor: active ? "#2c111b" : "#171820" },
});

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Box component={NextLink} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} sx={linkSx(active)}>
      {item.icon}
      {item.label}
    </Box>
  );
}

/**
 * Casca da área Admin (Figma "Admin UX", `8:3436`): barra lateral de 224 px
 * com as seções operacionais agrupadas por tipo (cada grupo abre e fecha, o da página atual vem aberto), faixa superior com o caminho (breadcrumb), a
 * data e o fuso, e o conteúdo da seção. Acesso restrito a administradores.
 */
export function AdminFrame({ adminName, timeZone, role, children }: { adminName: string; timeZone: string; role: string; children: ReactNode }) {
  const pathname = usePathname();
  // Fase 9: o menu mostra só as áreas que o papel pode abrir (o servidor confere de novo em cada página e API).
  const nav = NAV.filter((item) => can(role, item.perm ?? "catalog"));
  const current = nav.find((item) => isActive(pathname, item.href) && item.href !== "/admin") ?? nav[0] ?? NAV[0];
  // Grupo sem escolha da pessoa: aberto se a página atual está nele (a casca não remonta entre páginas, então segue a rota).
  const [open, setOpen] = useState<Partial<Record<GroupKey, boolean>>>({});
  // Celular e tablet: o menu fica recolhido atrás do botão "Menu" (com a seção atual) e fecha ao escolher uma página.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const currentLabel = nav.find((item) => isActive(pathname, item.href))?.label ?? current.label;
  const now = new Date();
  const dateLabel = `${new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(now).replace(".", "").toUpperCase()} ${new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(now)} ${new Intl.DateTimeFormat("pt-BR", { timeZone, month: "short" }).format(now).replace(".", "").toUpperCase()} ${new Intl.DateTimeFormat("pt-BR", { timeZone, year: "numeric" }).format(now)} · ${timeZone}`;

  return (
    <Box sx={{ display: { xs: "block", md: "flex" }, minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        component="aside"
        sx={{
          width: { xs: "100%", md: 224 },
          flexShrink: 0,
          borderRight: { md: 1 },
          borderBottom: { xs: 1, md: 0 },
          borderColor: "divider",
          bgcolor: "#0b0b0f",
          px: 3,
          py: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, md: 3 },
          position: { md: "sticky" },
          top: 0,
          alignSelf: { md: "flex-start" },
          minHeight: { md: "100vh" },
          // Fixa na tela e no máximo da altura da janela: com vários grupos abertos numa tela baixa, o menu rola sozinho
          // (sem isso, o fim do menu ficava fora de alcance).
          maxHeight: { md: "100vh" },
          overflowY: { md: "auto" },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <NextLink href="/admin" style={{ textDecoration: "none", color: "inherit" }}>
            <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 800, textTransform: "uppercase", lineHeight: 1.3 }}>Anime Hub</Typography>
          </NextLink>
          <ButtonBase
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            data-testid="admin-menu-toggle"
            sx={{ display: { xs: "inline-flex", md: "none" }, gap: 1, px: 1.5, minHeight: 44, minWidth: 0, borderRadius: "10px", border: 1, borderColor: "divider", fontSize: 14, fontWeight: 700, "& svg": { fontSize: 20 } }}
          >
            <MenuIcon />
            <Box component="span" sx={{ maxWidth: { xs: 150, sm: 260 }, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentLabel}
            </Box>
          </ButtonBase>
        </Box>
        <Box id="admin-menu" sx={{ display: { xs: menuOpen ? "flex" : "none", md: "flex" }, flexDirection: "column", gap: 3, flex: { md: 1 } }}>
          <Box sx={{ alignSelf: "flex-start", px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#171820" }}>
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              Admin / Operações
            </Typography>
          </Box>
          <Box component="nav" aria-label="Administração" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {nav
              .filter((item) => item.group === "inicio")
              .map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={closeMenu} />
              ))}
            {GROUPS.map((group) => {
              const items = nav.filter((item) => item.group === group.key);
              if (items.length === 0) return null;
              const hasActive = items.some((item) => isActive(pathname, item.href));
              const expanded = open[group.key] ?? hasActive;
              const listId = `admin-group-${group.key}`;
              return (
                <Box key={group.key} sx={{ display: "flex", flexDirection: "column" }}>
                  <ButtonBase
                    onClick={() => setOpen((o) => ({ ...o, [group.key]: !expanded }))}
                    aria-expanded={expanded}
                    aria-controls={listId}
                    data-testid={`admin-group-toggle-${group.key}`}
                    sx={{ justifyContent: "space-between", px: 1.5, py: 1, minHeight: 40, borderRadius: "10px", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: hasActive ? "text.primary" : "text.secondary", "&:hover": { bgcolor: "#171820", color: "text.primary" } }}
                  >
                    {/* Rótulo alinhado à esquerda (os de duas linhas não centralizam, como faria o botão). */}
                    <span style={{ textAlign: "left" }}>{group.label}</span>
                    <ExpandMoreIcon sx={{ fontSize: 18, flexShrink: 0, transition: "transform 150ms", transform: expanded ? "rotate(180deg)" : "none" }} />
                  </ButtonBase>
                  <Collapse in={expanded} id={listId}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, pl: 1, pb: 0.5 }}>
                      {items.map((item) => (
                        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={closeMenu} />
                      ))}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
          <Box
            component={NextLink}
            href="/dashboard"
            data-testid="admin-back-to-site"
            sx={{
              mt: { md: "auto" },
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              minHeight: 44,
              boxSizing: "border-box",
              borderRadius: "10px",
              border: 1,
              borderColor: "divider",
              fontSize: 14,
              fontWeight: 700,
              color: "text.primary",
              textDecoration: "none",
              "& svg": { fontSize: 18 },
              "&:hover": { bgcolor: "#171820" },
            }}
          >
            <ArrowBackIcon />
            Voltar ao Anime Hub
          </Box>
          <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.5 }}>
            Acesso restrito · Administrador {adminName}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, px: { xs: 3, md: 5 }, height: 65, borderBottom: 1, borderColor: "divider" }}>
          <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
            ADMIN / {current.crumb}
          </Typography>
          {/* No celular não cabe junto do caminho (ADMIN / …): a data com o fuso fica só a partir do tablet. */}
          <Typography component="span" suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap", display: { xs: "none", sm: "inline" } }}>
            {dateLabel}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, px: { xs: 3, md: 5 }, pt: 6, pb: 5, display: "flex", flexDirection: "column", gap: 4 }}>{children}</Box>
        <Typography sx={{ px: { xs: 3, md: 5 }, pb: 4, fontSize: 12, color: "text.secondary" }}>
          Mudanças só após revisão e confirmação explícita.
        </Typography>
      </Box>
    </Box>
  );
}
