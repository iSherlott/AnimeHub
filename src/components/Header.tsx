"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
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
  Toolbar,
  Typography,
} from "@mui/material";
import { TitleLanguageMenu } from "@/components/TitleLanguageMenu";
import { NotificationBell } from "@/components/NotificationBell";
import type { PublicUser } from "@/lib/auth/session";

function NavLinks({
  pathname,
  user,
  onNavigate,
  direction = "row",
}: {
  pathname: string;
  user: PublicUser | null | undefined;
  onNavigate?: () => void;
  direction?: "row" | "column";
}) {
  const linkSx = (href: string) => ({
    fontWeight: 600,
    textTransform: "uppercase" as const,
    fontSize: 14,
    color: pathname === href ? "text.primary" : "text.secondary",
  });

  return (
    <Stack
      direction={direction}
      spacing={direction === "row" ? 3 : 2}
      sx={{ alignItems: direction === "row" ? "center" : "flex-start" }}
    >
      {user && (
        <MuiLink
          component={NextLink}
          href="/"
          onClick={onNavigate}
          underline="hover"
          sx={linkSx("/")}
          aria-current={pathname === "/" ? "page" : undefined}
        >
          Minha lista
        </MuiLink>
      )}
      <MuiLink
        component={NextLink}
        href="/discover"
        onClick={onNavigate}
        underline="hover"
        sx={linkSx("/discover")}
        aria-current={pathname === "/discover" ? "page" : undefined}
      >
        Descobrir
      </MuiLink>
      <MuiLink
        component={NextLink}
        href="/calendar"
        onClick={onNavigate}
        underline="hover"
        sx={linkSx("/calendar")}
        aria-current={pathname === "/calendar" ? "page" : undefined}
      >
        Calendário
      </MuiLink>
      {user?.role === "ADMIN" && (
        <MuiLink
          component={NextLink}
          href="/admin"
          onClick={onNavigate}
          underline="hover"
          sx={linkSx("/admin")}
          aria-current={pathname === "/admin" ? "page" : undefined}
        >
          Administração
        </MuiLink>
      )}
    </Stack>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Fecha o menu mobile sempre que a rota muda. A receita oficial do React
  // pra "resetar estado quando um valor muda" seria ajustar isso durante a
  // renderização via ref — mas o lint react-hooks/refs deste projeto (mira
  // compatibilidade com o React Compiler) proíbe acessar ref.current fora
  // de efeito/handler, então essa receita não se aplica aqui. Um efeito
  // reagindo à mudança de pathname continua sendo a forma correta.
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
    <>
      <AppBar
        position="sticky"
        elevation={scrolled ? 4 : 0}
        sx={{
          bgcolor: scrolled ? "rgba(11,11,13,0.95)" : "transparent",
          backgroundImage: scrolled
            ? "none"
            : "linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.4), transparent)",
          borderBottom: scrolled ? "1px solid" : "none",
          borderColor: "divider",
          transition: "background-color .3s ease, border-color .3s ease",
        }}
      >
        <Toolbar sx={{ gap: 4, px: { xs: 3, sm: 5 } }}>
          <MuiLink
            component={NextLink}
            href="/"
            underline="none"
            className="font-display"
            sx={{ fontSize: 24, textTransform: "uppercase", letterSpacing: 1, color: "primary.main" }}
          >
            Anime Hub
          </MuiLink>

          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <NavLinks pathname={pathname} user={user} />
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ ml: "auto", display: { xs: "none", sm: "flex" }, alignItems: "center" }}
          >
            <TitleLanguageMenu />
            <NotificationBell user={user} />
            {user === undefined ? (
              <Skeleton variant="rounded" width={64} height={30} />
            ) : user ? (
              <>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ display: { xs: "none", md: "inline" }, color: "text.secondary", maxWidth: 140 }}
                >
                  {user.displayName}
                </Typography>
                <Button onClick={handleLogout} color="inherit" size="small">
                  Sair
                </Button>
              </>
            ) : (
              <Button component={NextLink} href="/login" color="inherit" size="small">
                Entrar
              </Button>
            )}
          </Stack>

          <IconButton
            onClick={() => setMobileOpen((v) => !v)}
            sx={{ ml: "auto", display: { xs: "inline-flex", sm: "none" } }}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
        </Toolbar>

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
            <NavLinks
              pathname={pathname}
              user={user}
              onNavigate={() => setMobileOpen(false)}
              direction="column"
            />
            <Divider />
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <TitleLanguageMenu />
                <NotificationBell user={user} />
              </Stack>
              {user === undefined ? (
                <Skeleton variant="rounded" width={64} height={30} />
              ) : user ? (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" noWrap sx={{ color: "text.secondary", maxWidth: 140 }}>
                    {user.displayName}
                  </Typography>
                  <Button onClick={handleLogout} size="small">
                    Sair
                  </Button>
                </Stack>
              ) : (
                <Button
                  component={NextLink}
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  size="small"
                >
                  Entrar
                </Button>
              )}
            </Stack>
          </Box>
        </Collapse>
      </AppBar>
    </>
  );
}
