"use client";

import { loginHref } from "@/lib/safeRedirect";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import {
  AppBar,
  Box,
  Button,
  Collapse,
  Divider,
  IconButton,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { TitleLanguageMenu } from "@/components/TitleLanguageMenu";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PublicUser } from "@/lib/auth/session";

/** Largura a partir da qual o menu completo (logo + nav + conta) cabe sem hambúrguer. */
const DESKTOP_QUERY = "@media (min-width:1240px)";

const NAV_ITEMS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: "/discover", label: "Explorar", match: (p) => p === "/discover" },
  { href: "/calendar", label: "Calendário", match: (p) => p === "/calendar" },
  { href: "/minha-lista", label: "Meus animes", match: (p) => p === "/minha-lista" },
  // "Comunidade" cobre o feed e as telas sociais (publicar, buscar, hashtag, discussão, perfis).
  {
    href: "/",
    label: "Comunidade",
    match: (p) =>
      p === "/" ||
      p.startsWith("/publicar") ||
      p.startsWith("/buscar") ||
      p.startsWith("/hashtag") ||
      p.startsWith("/publicacao") ||
      p.startsWith("/users"),
  },
];

function NavLinks({
  pathname,
  onNavigate,
  direction = "row",
}: {
  pathname: string;
  onNavigate?: () => void;
  direction?: "row" | "column";
}) {
  // "Administração" não fica mais aqui: o acesso é pelo menu do perfil (avatar).
  const items = [...NAV_ITEMS];

  return (
    <Stack
      direction={direction}
      spacing={direction === "row" ? 5 : 2}
      sx={{ alignItems: direction === "row" ? "flex-start" : "stretch" }}
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <MuiLink
            key={item.href}
            component={NextLink}
            href={item.href}
            onClick={onNavigate}
            underline="none"
            aria-current={active ? "page" : undefined}
            sx={{
              display: "inline-flex",
              flexDirection: "column",
              gap: 1,
              fontWeight: 700,
              textTransform: "uppercase",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              color: active ? "text.primary" : "text.secondary",
              "&:hover": { color: "text.primary" },
              // Indicador ativo do Figma: barra de acento de 2 px sob o item
              // (reservada também nos inativos para a altura não oscilar).
              "&::after": {
                content: '""',
                display: "block",
                height: 2,
                width: "100%",
                bgcolor: active ? "primary.main" : "transparent",
              },
            }}
          >
            {item.label}
          </MuiLink>
        );
      })}
    </Stack>
  );
}

function AccountArea({ user, onLogout, pathname }: { user: PublicUser | null | undefined; onLogout: () => void; pathname: string }) {
  if (user === undefined) return <Skeleton variant="rounded" width={64} height={30} />;
  if (!user) {
    return (
      <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
        {/* Visitante (Figma "Header público"): sino, preferências e "Entrar". */}
        <IconButton
          component={NextLink}
          href={loginHref(pathname)}
          aria-label="Notificações — entre para acompanhar lançamentos"
          sx={{ color: "text.secondary" }}
        >
          <NotificationsNoneIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <TitleLanguageMenu />
        <Button
          component={NextLink}
          href={loginHref(pathname)}
          startIcon={<PersonOutlineIcon />}
          sx={{ bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } }}
        >
          Entrar
        </Button>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
      <NotificationBell user={user} />
      <IconButton component={NextLink} href="/configuracoes" aria-label="Configurações" sx={{ color: "text.secondary" }}>
        <TuneIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <AccountMenu user={user} onLogout={onLogout} />
    </Stack>
  );
}

/**
 * Cabeçalho do Figma ("Header / Expansão social"): 88 px, borda inferior,
 * marca com selo de acento, navegação em caixa alta com indicador ativo e,
 * à direita, sino com contagens (Lançamentos · Social), Configurações e
 * avatar. Abaixo de 1240 px vira hambúrguer (comportamento já existente).
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useCurrentUser();
  const setUser = useSetCurrentUser();

  // Fecha o menu mobile sempre que a rota muda. A receita oficial do React
  // pra "resetar estado quando um valor muda" usaria ref durante o render,
  // o que o lint react-hooks/refs deste projeto proíbe; um efeito reagindo
  // à mudança de pathname continua sendo a forma correta aqui.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMobileOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{ bgcolor: "background.default", backgroundImage: "none", borderBottom: 1, borderColor: "divider" }}
    >
      <Box
        sx={{
          height: 88,
          px: { xs: 2, sm: 4, lg: 8 },
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <MuiLink
          component={NextLink}
          href={user ? "/dashboard" : "/discover"}
          underline="none"
          sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}
        >
          <Box sx={{ width: 6, height: 28, bgcolor: "primary.main", flexShrink: 0 }} />
          <Typography component="span" sx={{ fontSize: 23, fontWeight: 800, color: "text.primary", whiteSpace: "nowrap", textTransform: "uppercase" }}>
            Anime Hub
          </Typography>
        </MuiLink>

        {/* Abaixo de 1240 px o nav completo não cabe com folga (medido ao
            vivo na 3ª rodada de auditoria, Epic 18) e vira hambúrguer. */}
        <Box component="nav" aria-label="Navegação principal" sx={{ display: "none", [DESKTOP_QUERY]: { display: "block" } }}>
          <NavLinks pathname={pathname} />
        </Box>

        <Box sx={{ display: "none", [DESKTOP_QUERY]: { display: "flex" }, alignItems: "center" }}>
          <AccountArea user={user} onLogout={handleLogout} pathname={pathname} />
        </Box>

        <IconButton
          onClick={() => setMobileOpen((v) => !v)}
          sx={{ ml: "auto", display: "inline-flex", [DESKTOP_QUERY]: { display: "none" } }}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
        </IconButton>
      </Box>

      <Collapse in={mobileOpen} unmountOnExit>
        <Box
          sx={{
            bgcolor: "background.default",
            borderTop: 1,
            borderColor: "divider",
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <Box component="nav" aria-label="Navegação principal">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} direction="column" />
          </Box>
          <Divider />
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <AccountArea user={user} onLogout={handleLogout} pathname={pathname} />
          </Stack>
        </Box>
      </Collapse>
    </AppBar>
  );
}
