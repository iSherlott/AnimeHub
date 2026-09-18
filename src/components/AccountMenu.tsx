"use client";

import { useId, useState, type MouseEvent } from "react";
import NextLink from "next/link";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import LogoutIcon from "@mui/icons-material/Logout";
import { Avatar, Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { LanguageMenuItems } from "@/components/TitleLanguageMenu";
import { avatarColor, initials } from "@/lib/avatarColor";
import type { PublicUser } from "@/lib/auth/session";

/**
 * Dropdown único pra quem está logado (Epic 27, lote 3) — funde o que
 * antes eram 3 elementos soltos no Header (engrenagem de idioma, nome,
 * botão "Sair") num só menu ancorado no avatar, e ganha "Meu perfil"/
 * "Administração" que não existiam antes. Deslogado continua usando só
 * `TitleLanguageMenu` (sem conta pra ter menu nenhum).
 */
export function AccountMenu({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonId = useId();
  const menuId = useId();

  function handleOpen(e: MouseEvent<HTMLElement>) {
    setAnchorEl(e.currentTarget);
  }
  function handleClose() {
    setAnchorEl(null);
  }

  return (
    <>
      {/* O cabeçalho não tem mais o nome como texto sempre visível (só o
          avatar, 1 letra) — a tooltip é o único jeito de conferir quem
          está logado sem abrir o menu (achado real da revisão de código
          deste lote). */}
      <Tooltip title={user.displayName}>
        <IconButton
          id={buttonId}
          onClick={handleOpen}
          size="small"
          aria-label="Menu da conta"
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          aria-expanded={open ? "true" : undefined}
        >
          <Avatar sx={{ bgcolor: avatarColor(user.id), width: 28, height: 28, fontSize: 12, fontWeight: 700 }}>
            {initials(user.displayName)}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        <Typography variant="body2" noWrap sx={{ px: 2, py: 0.5, fontWeight: 700, maxWidth: 220 }}>
          {user.displayName}
        </Typography>
        <Divider />

        <LanguageMenuItems onSelect={handleClose} />
        <Divider />

        <MenuItem component={NextLink} href={`/users/${user.id}`} onClick={handleClose}>
          <ListItemIcon>
            <AccountCircleIcon fontSize="small" />
          </ListItemIcon>
          Meu perfil
        </MenuItem>
        {user.role === "ADMIN" && (
          <MenuItem component={NextLink} href="/admin" onClick={handleClose}>
            <ListItemIcon>
              <AdminPanelSettingsIcon fontSize="small" />
            </ListItemIcon>
            Administração
          </MenuItem>
        )}
        <Divider />

        <MenuItem
          onClick={() => {
            handleClose();
            onLogout();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sair
        </MenuItem>
      </Menu>
    </>
  );
}
