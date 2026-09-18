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
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";
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
    position: "relative" as const,
    display: "inline-block" as const,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    fontSize: 14,
    color: pathname === href ? "text.primary" : "text.secondary",
    // Mesmo problema do logo "Anime Hub" (Epic 20) — "Minha lista" quebrava
    // em 2 linhas exatamente nos 768px de tablet quando logado (link mais
    // longo que "Entrar", que sozinho nunca quebrava).
    whiteSpace: "nowrap" as const,
    pb: 0.75,
    // Mesma barra inclinada do logo, em miniatura, sob o link ativo — em
    // vez de só trocar a cor (Epic 27, lote 3).
    "&::after":
      pathname === href
        ? {
            content: '""',
            position: "absolute",
            left: "50%",
            bottom: 0,
            width: 10,
            height: 2,
            bgcolor: "primary.main",
            transform: "translateX(-50%) skewX(-12deg)",
          }
        : undefined,
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
          href="/minha-lista"
          onClick={onNavigate}
          underline="hover"
          sx={linkSx("/minha-lista")}
          aria-current={pathname === "/minha-lista" ? "page" : undefined}
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
  const user = useCurrentUser();
  const setUser = useSetCurrentUser();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
          // Mesmo "gradiente com pontas apagando" já usado no banner da
          // página de detalhe/hero (accentColor) — borda inferior fina em
          // vez de uma linha cinza plana, só quando rolado (Epic 27, lote
          // 3: reforça a identidade "anime" já estabelecida no resto do
          // app, sem inventar linguagem visual nova).
          "&::after": scrolled
            ? {
                content: '""',
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "1px",
                background: (theme) =>
                  `linear-gradient(to right, transparent, ${theme.palette.primary.main}, transparent)`,
              }
            : {},
          transition: "background-color .3s ease",
        }}
      >
        <Toolbar sx={{ gap: 4, px: { xs: 3, sm: 5 } }}>
          <MuiLink
            component={NextLink}
            href="/"
            underline="none"
            sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
          >
            {/* Mesmo motivo de "linha de velocidade" usado antes de todo
                título de seção na página de detalhe do anime — amarra o
                cabeçalho à mesma identidade visual do resto do app. */}
            <Box sx={{ width: 6, height: 20, bgcolor: "primary.main", transform: "skewX(-12deg)", flexShrink: 0 }} />
            <Typography
              component="span"
              className="font-display"
              sx={{
                fontSize: 24,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "primary.main",
                whiteSpace: "nowrap",
              }}
            >
              Anime Hub
            </Typography>
          </MuiLink>

          {/* O breakpoint pra virar menu hambúrguer era "sm" (600px), mas o
              nav completo (logo + até 5 links + gear/sino/nome/Sair, mais
              ainda pra admin com "Administração") só cabe de verdade bem
              mais tarde — sobrava uma faixa real de largura (achado da 3ª
              rodada de auditoria, Epic 18) onde o nav não quebrava pro
              hambúrguer nem cabia inteiro, empurrando sino/config/Sair pra
              fora da tela sem nenhuma pista visual.

              Um breakpoint fixo do MUI ("lg", 1200px) medido ao vivo ficou
              em ~0px de folga no pior caso real (admin, nome no limite de
              140px, página com scrollbar) — troca de fonte, hinting de
              sub-pixel ou zoom já bastavam pra reabrir o mesmo bug em
              silêncio. A primeira correção só subiu o breakpoint pra
              1300px, mas isso regrediu o caso comum: 1280px é a largura
              padrão da suíte de teste (device "Desktop Chrome" do
              Playwright) e também uma largura real de navegador/laptop
              bem comum — nesses 1280px o nav completo já cabia de sobra
              antes desta mudança. Em vez de só empurrar o breakpoint pra
              cima (o que sempre existe risco de ultrapassar alguma largura
              comum de verdade), a correção reduz também o pior caso:
              maxWidth do nome caiu de 140 pra 100px (link acima). Com as
              duas mudanças juntas, 1240px (customizado, não um token do
              MUI) fica com folga real acima do pior caso e ainda abaixo
              dos 1280px comuns. */}
          <Box
            component="nav"
            aria-label="Navegação principal"
            sx={{
              display: "none",
              "@media (min-width:1240px)": { display: "block" },
            }}
          >
            <NavLinks pathname={pathname} user={user} />
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              ml: "auto",
              display: "none",
              "@media (min-width:1240px)": { display: "flex" },
              alignItems: "center",
            }}
          >
            <NotificationBell user={user} />
            {user === undefined ? (
              <Skeleton variant="rounded" width={64} height={30} />
            ) : user ? (
              <AccountMenu user={user} onLogout={handleLogout} />
            ) : (
              <>
                <TitleLanguageMenu />
                <Button component={NextLink} href="/login" color="inherit" size="small">
                  Entrar
                </Button>
              </>
            )}
          </Stack>

          <IconButton
            onClick={() => setMobileOpen((v) => !v)}
            sx={{
              ml: "auto",
              display: "inline-flex",
              "@media (min-width:1240px)": { display: "none" },
            }}
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
            <Box component="nav" aria-label="Navegação principal">
              <NavLinks
                pathname={pathname}
                user={user}
                onNavigate={() => setMobileOpen(false)}
                direction="column"
              />
            </Box>
            <Divider />
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {!user && <TitleLanguageMenu />}
                <NotificationBell user={user} />
              </Stack>
              {user === undefined ? (
                <Skeleton variant="rounded" width={64} height={30} />
              ) : user ? (
                <AccountMenu user={user} onLogout={handleLogout} />
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
