"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import RadarOutlinedIcon from "@mui/icons-material/RadarOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Box, Typography } from "@mui/material";

type NavItem = { href: string; label: string; icon: ReactNode; crumb: string };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <DashboardOutlinedIcon />, crumb: "DASHBOARD" },
  { href: "/admin/catalogo", label: "Catálogo", icon: <LibraryBooksOutlinedIcon />, crumb: "CATÁLOGO" },
  { href: "/admin/importacoes", label: "Importações", icon: <FileDownloadOutlinedIcon />, crumb: "IMPORTAÇÕES" },
  { href: "/admin/quizzes", label: "Quizzes", icon: <QuizOutlinedIcon />, crumb: "QUIZZES" },
  { href: "/admin/matching", label: "Matching", icon: <CompareArrowsOutlinedIcon />, crumb: "MATCHING" },
  { href: "/admin/scrapers", label: "Scrapers", icon: <RadarOutlinedIcon />, crumb: "SCRAPERS" },
  { href: "/admin/jobs", label: "Jobs", icon: <AccountTreeOutlinedIcon />, crumb: "JOBS" },
  { href: "/admin/conflitos", label: "Conflitos", icon: <WarningAmberOutlinedIcon />, crumb: "CONFLITOS" },
  { href: "/admin/overrides", label: "Overrides", icon: <EditOutlinedIcon />, crumb: "OVERRIDES" },
  { href: "/admin/logs", label: "Logs", icon: <FilterListOutlinedIcon />, crumb: "LOGS" },
  { href: "/admin/acesso", label: "Acesso e moderação", icon: <AdminPanelSettingsOutlinedIcon />, crumb: "ACESSO E MODERAÇÃO" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Casca da área Admin (Figma "Admin UX", `8:3436`): barra lateral de 224 px
 * com as seções operacionais, faixa superior com o caminho (breadcrumb), a
 * data e o fuso, e o conteúdo da seção. Acesso restrito a administradores.
 */
export function AdminFrame({ adminName, timeZone, children }: { adminName: string; timeZone: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = NAV.find((item) => isActive(pathname, item.href) && item.href !== "/admin") ?? NAV[0];
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
          {NAV.map((item) => {
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
