"use client";

import { useId, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import BlockIcon from "@mui/icons-material/Block";
import FlagIcon from "@mui/icons-material/Flag";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { ReportDialog } from "@/components/ReportDialog";

/**
 * Menu "Denunciar / bloquear" do perfil de outra pessoa (Figma `13:42598`,
 * `13:43571`): denunciar perfil e bloquear com confirmação separada.
 * Denunciar NÃO bloqueia (e vice-versa).
 */
export function ProfileSafetyMenu({ userId, displayName }: { userId: string; displayName: string }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonId = useId();
  const menuId = useId();

  async function confirmBlock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/block`, { method: "PUT" });
      if (!res.ok) throw new Error("falha");
      setBlockOpen(false);
      router.refresh();
    } catch {
      setError("Não foi possível bloquear. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip title="Denunciar / bloquear">
        <IconButton
          id={buttonId}
          size="small"
          aria-label="Denunciar / bloquear"
          aria-haspopup="true"
          aria-controls={anchorEl ? menuId : undefined}
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            setReportOpen(true);
          }}
        >
          <ListItemIcon>
            <FlagIcon fontSize="small" />
          </ListItemIcon>
          Denunciar perfil
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            setBlockOpen(true);
          }}
        >
          <ListItemIcon>
            <BlockIcon fontSize="small" />
          </ListItemIcon>
          Bloquear perfil
        </MenuItem>
      </Menu>

      <Dialog open={blockOpen} onClose={() => (busy ? undefined : setBlockOpen(false))} aria-labelledby="block-title">
        <DialogTitle id="block-title">Bloquear {displayName}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            As interações deste perfil deixarão de aparecer para você, e o perfil também deixará de ver as suas. A sua
            lista privada de animes não será compartilhada.
          </DialogContentText>
          {error && (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setBlockOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={confirmBlock} disabled={busy} data-testid="block-confirm">
            {busy ? "Bloqueando…" : "Bloquear"}
          </Button>
        </DialogActions>
      </Dialog>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ kind: "profile", id: userId }}
        targetLabel={`o perfil de ${displayName}`}
      />
    </>
  );
}
