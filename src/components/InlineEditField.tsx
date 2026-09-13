"use client";

import { useState, type ReactNode } from "react";
import { Button, Stack } from "@mui/material";

/**
 * Casca compartilhada do padrão "link de texto → formulário inline com
 * Salvar/cancelar" usado por AnidbIdEditor/SeriesGroupEditor/TitleEditor —
 * cada um só fornece os próprios campos (via children) e a lógica de save.
 */
export function InlineEditField({
  triggerLabel,
  onSave,
  extraContent,
  children,
}: {
  triggerLabel: string;
  onSave: () => Promise<void>;
  extraContent?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
      setOpen(false);
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
      <Button onClick={() => setOpen(false)} size="small" color="inherit">
        cancelar
      </Button>
    </Stack>
  );
}
