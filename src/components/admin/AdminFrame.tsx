"use client";

import type { ReactNode } from "react";
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
import { Box, Typography } from "@mui/material";
import { can, type Permission } from "@/lib/auth/permissions";

type NavItem = { href: string; label: string; icon: ReactNode; crumb: string; perm?: Permission };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <DashboardOutlinedIcon />, crumb: "DASHBOARD" },
  { href: "/admin/saude", label: "Saúde do catálogo", icon: <MonitorHeartOutlinedIcon />, crumb: "SAÚDE DO CATÁLOGO" },
  { href: "/admin/obras", label: "Catálogo de obras", icon: <MovieFilterOutlinedIcon />, crumb: "CATÁLOGO DE OBRAS" },
  { href: "/admin/episodios", label: "Episódios", icon: <VideoLibraryOutlinedIcon />, crumb: "EPISÓDIOS" },
  { href: "/admin/calendario", label: "Calendário", icon: <CalendarMonthOutlinedIcon />, crumb: "CALENDÁRIO" },
  { href: "/admin/correspondencias", label: "Correspondências", icon: <JoinInnerOutlinedIcon />, crumb: "CORRESPONDÊNCIAS" },
  { href: "/admin/atualizacoes", label: "Atualização seletiva", icon: <SyncAltOutlinedIcon />, crumb: "ATUALIZAÇÃO SELETIVA" },
  { href: "/admin/franquias", label: "Franquias", icon: <TimelineOutlinedIcon />, crumb: "FRANQUIAS" },
  { href: "/admin/catalogo", label: "Produções e franquias", icon: <LibraryBooksOutlinedIcon />, crumb: "PRODUÇÕES E FRANQUIAS" },
  { href: "/admin/taxonomia", label: "Taxonomia", icon: <CategoryOutlinedIcon />, crumb: "TAXONOMIA" },
  { href: "/admin/traducoes", label: "Traduções", icon: <TranslateOutlinedIcon />, crumb: "TRADUÇÕES" },
  { href: "/admin/pendencias", label: "Pendências", icon: <RuleOutlinedIcon />, crumb: "PENDÊNCIAS" },
  { href: "/admin/curadoria", label: "Curadoria", icon: <FactCheckOutlinedIcon />, crumb: "CURADORIA" },
  { href: "/admin/importacoes", label: "Importações", icon: <FileDownloadOutlinedIcon />, crumb: "IMPORTAÇÕES" },
  { href: "/admin/match-name", label: "Match name", icon: <LinkOutlinedIcon />, crumb: "MATCH NAME" },
  { href: "/admin/quizzes", label: "Quizzes", icon: <QuizOutlinedIcon />, crumb: "QUIZZES" },
  { href: "/admin/matching", label: "Matching", icon: <CompareArrowsOutlinedIcon />, crumb: "MATCHING" },
  { href: "/admin/scrapers", label: "Scrapers", icon: <RadarOutlinedIcon />, crumb: "SCRAPERS" },
  { href: "/admin/jobs", label: "Jobs", icon: <AccountTreeOutlinedIcon />, crumb: "JOBS" },
  { href: "/admin/conflitos", label: "Conflitos", icon: <WarningAmberOutlinedIcon />, crumb: "CONFLITOS" },
  { href: "/admin/overrides", label: "Overrides", icon: <EditOutlinedIcon />, crumb: "OVERRIDES" },
  { href: "/admin/logs", label: "Logs", icon: <FilterListOutlinedIcon />, crumb: "LOGS" },
  { href: "/admin/acesso", label: "Acesso e moderação", icon: <AdminPanelSettingsOutlinedIcon />, crumb: "ACESSO E MODERAÇÃO", perm: "moderation" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Casca da área Admin (Figma "Admin UX", `8:3436`): barra lateral de 224 px
 * com as seções operacionais, faixa superior com o caminho (breadcrumb), a
 * data e o fuso, e o conteúdo da seção. Acesso restrito a administradores.
 */
export function AdminFrame({ adminName, timeZone, role, children }: { adminName: string; timeZone: string; role: string; children: ReactNode }) {
  const pathname = usePathname();
  // Fase 9: o menu mostra só as áreas que o papel pode abrir (o servidor confere de novo em cada página e API).
  const nav = NAV.filter((item) => can(role, item.perm ?? "catalog"));
  const current = nav.find((item) => isActive(pathname, item.href) && item.href !== "/admin") ?? nav[0] ?? NAV[0];
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
          py: 4,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          position: { md: "sticky" },
          top: 0,
          alignSelf: { md: "flex-start" },
          minHeight: { md: "100vh" },
        }}
      >
        <NextLink href="/admin" style={{ textDecoration: "none", color: "inherit" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 800, textTransform: "uppercase", lineHeight: 1.3 }}>Anime Hub</Typography>
        </NextLink>
        <Box sx={{ alignSelf: "flex-start", px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#171820" }}>
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Admin / Operações
          </Typography>
        </Box>
        <Box component="nav" aria-label="Administração" sx={{ display: "flex", flexDirection: { xs: "row", md: "column" }, flexWrap: "wrap", gap: 0.5 }}>
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Box
                key={item.href}
                component={NextLink}
                href={item.href}
                aria-current={active ? "page" : undefined}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1.25,
                  minHeight: 44,
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  fontSize: 15,
                  color: active ? "text.primary" : "text.secondary",
                  bgcolor: active ? "#2c111b" : "transparent",
                  textDecoration: "none",
                  "& svg": { fontSize: 20, color: active ? "primary.main" : "text.secondary" },
                  "&:hover": { color: "text.primary", bgcolor: active ? "#2c111b" : "#171820" },
                }}
              >
                {item.icon}
                {item.label}
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

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, px: { xs: 3, md: 5 }, height: 65, borderBottom: 1, borderColor: "divider" }}>
          <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
            ADMIN / {current.crumb}
          </Typography>
          <Typography component="span" suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
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
