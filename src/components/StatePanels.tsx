"use client";

import { useEffect, useRef, type ReactNode } from "react";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import { Box, Button, Dialog, Typography } from "@mui/material";

/**
 * Biblioteca de estados do Figma (página "11 — States"): vazio, erro, sucesso
 * e confirmação. Regra comum — nunca confundir Empty com Loading ou Error, e
 * sempre dizer o que aconteceu e qual é a próxima ação.
 */

export const OUTLINED_BUTTON_SX = {
  bgcolor: "transparent",
  color: "text.primary",
  border: 2,
  borderColor: "text.primary",
  "&:hover": { bgcolor: "rgba(242,242,245,0.08)", borderColor: "text.primary" },
} as const;

/** "Empty" — ícone, frase curta, motivo e a ação relevante (24 px de título). */
export function EmptyState({
  icon,
  title,
  children,
  action,
  testId = "state-empty",
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 2, px: 3, py: 5 }}
    >
      {icon && <Box sx={{ display: "flex", color: "text.secondary", "& svg": { fontSize: 32 } }}>{icon}</Box>}
      <Typography component="h2" sx={{ fontSize: 24, lineHeight: 1.4 }}>
        {title}
      </Typography>
      {children && (
        <Typography sx={{ fontSize: 14, color: "text.secondary", maxWidth: 560 }}>{children}</Typography>
      )}
      {action}
    </Box>
  );
}

/** Painel com título em caixa alta que abriga um estado (como nas pranchas do Figma). */
export function StateFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider", p: 3 }}>
      <Typography component="h2" sx={{ fontSize: 18, textTransform: "uppercase", mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

type NoticeTone = "error" | "success" | "warning" | "info";

const NOTICE_COLORS: Record<NoticeTone, { border: string; icon: string }> = {
  error: { border: "primary.main", icon: "primary.main" },
  success: { border: "divider", icon: "success.main" },
  warning: { border: "divider", icon: "warning.main" },
  info: { border: "divider", icon: "text.secondary" },
};

/** Aviso inline do Figma (erro / sucesso / atenção / info): título, mensagem e ação opcional. */
export function Notice({
  tone,
  title,
  children,
  action,
  testId,
}: {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  const colors = NOTICE_COLORS[tone];
  const Icon = tone === "error" ? ErrorOutlinedIcon : tone === "success" ? CheckCircleOutlinedIcon : InfoOutlinedIcon;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        role={tone === "error" ? "alert" : "status"}
        data-testid={testId}
        sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "10px", bgcolor: "background.paper", border: 1, borderColor: colors.border }}
      >
        <Icon aria-hidden sx={{ fontSize: 20, color: colors.icon, mt: 0.25 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, lineHeight: 1.5 }}>{title}</Typography>
          {children && <Typography component="div" sx={{ fontSize: 14, color: "text.secondary" }}>{children}</Typography>}
        </Box>
      </Box>
      {action}
    </Box>
  );
}

/** Erro recuperável: mensagem clara, entradas preservadas e "Tentar novamente" (nunca zera os dados). */
export function ErrorNotice({
  title,
  children,
  onRetry,
  retryLabel = "Tentar novamente",
  testId,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
}) {
  return (
    <Notice
      tone="error"
      title={title}
      testId={testId}
      action={
        onRetry && (
          <Box>
            <Button onClick={onRetry} variant="contained" startIcon={<ReplayIcon />} sx={{ textTransform: "uppercase" }}>
              {retryLabel}
            </Button>
          </Box>
        )
      }
    >
      {children}
    </Notice>
  );
}

/**
 * Confirmação explícita do Figma ("27 Confirmation"): título em forma de
 * pergunta, o que será afetado, "Efeito da ação" e dois botões. Foco inicial em
 * Cancelar; Esc e scrim fecham sem aplicar; durante a requisição o botão
 * principal vira "Confirmando…"/"Removendo…" e o diálogo não fecha sozinho —
 * falha mantém o diálogo aberto com a mensagem e a opção de tentar de novo.
 */
export function ConfirmDialog({
  open,
  title,
  subject,
  effect,
  confirmLabel,
  busyLabel,
  busy = false,
  progress,
  error,
  onCancel,
  onConfirm,
  confirmTestId,
}: {
  open: boolean;
  title: string;
  subject?: ReactNode;
  effect: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  /** Andamento da ação (ex.: barra de progresso da carga); aparece no próprio diálogo enquanto `busy`. */
  progress?: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirmTestId?: string;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      // Espera o diálogo montar para posicionar o foco em "Cancelar".
      const id = requestAnimationFrame(() => cancelRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="confirm-title"
      slotProps={{ paper: { sx: { bgcolor: "background.paper", backgroundImage: "none", border: 1, borderColor: "divider", borderRadius: "16px" } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 4 }}>
        <Typography id="confirm-title" component="h2" sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {subject && <Typography sx={{ fontSize: 14 }}>{subject}</Typography>}
        <Box sx={{ display: "flex", gap: 2, p: 2, borderRadius: "10px", border: 1, borderColor: "divider" }}>
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, color: "text.secondary", mt: 0.25 }} />
          <Box>
            <Typography sx={{ fontSize: 14 }}>Efeito da ação</Typography>
            <Typography component="div" sx={{ fontSize: 13, color: "text.secondary" }}>
              {effect}
            </Typography>
          </Box>
        </Box>
        {busy && progress}
        {error && (
          <Typography role="alert" sx={{ fontSize: 14, color: "primary.main" }}>
            {error}
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Button ref={cancelRef} onClick={onCancel} disabled={busy} sx={OUTLINED_BUTTON_SX}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={busy} variant="contained" data-testid={confirmTestId}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </Box>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          Cancelar/Esc fecha sem alterar. Confirmar mostra loading, impede duplo envio e só fecha após sucesso.
        </Typography>
      </Box>
    </Dialog>
  );
}
