"use client";

import { useState, type ReactNode } from "react";
import { Button, Stack, Typography } from "@mui/material";

/**
 * Casca compartilhada do padrão "link de texto → formulário inline com
 * Salvar/cancelar" usado por AnidbIdEditor/SeriesGroupEditor/TitleEditor —
 * cada um só fornece os próprios campos (via children) e a lógica de save.
 */
export function InlineEditField({
  triggerLabel,
  onSave,
  onCancel,
  extraContent,
  children,
}: {
  triggerLabel: string;
  /** Deve rejeitar (throw) em caso de validação ou falha de servidor — só
   * assim o formulário fica aberto mostrando o erro em vez de fechar como
   * se tivesse salvo (achado real da 5ª rodada de auditoria, Epic 18: o
   * ID da AniDB inválido era descartado em silêncio, sem nenhum aviso). */
  onSave: () => Promise<void>;
  /** Restaura o(s) campo(s) do editor pro último valor salvo — sem isso,
   * "cancelar" só fechava o formulário e deixava o rascunho não salvo lá
   * dentro; reabrir mostrava o rascunho cancelado, não o valor real, com
   * risco real de sobrescrever o valor certo num "Salvar" futuro sem
   * querer (achado real da 5ª rodada de auditoria, Epic 18). */
  onCancel: () => void;
  extraContent?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="small"
        sx={{
          justifyContent: "flex-start",
          px: 0,
          minWidth: 0,
          fontSize: 12,
          fontWeight: 400,
          textTransform: "none",
          color: "text.secondary",
          "&:hover": { textDecoration: "underline", bgcolor: "transparent" },
        }}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", alignItems: "center", border: 1, borderColor: "divider", bgcolor: "background.paper", p: 1 }}
    >
      {children}
      {extraContent}
      <Button onClick={handleSave} disabled={saving} size="small" variant="outlined">
        {saving ? "..." : "Salvar"}
      </Button>
      <Button
        onClick={() => {
          setError(null);
          onCancel();
          setOpen(false);
        }}
        size="small"
        color="inherit"
      >
        cancelar
      </Button>
      {error && (
        <Typography variant="caption" color="error" sx={{ width: "100%" }}>
          {error}
        </Typography>
      )}
    </Stack>
  );
}
