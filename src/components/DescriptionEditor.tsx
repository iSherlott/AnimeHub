"use client";

import { useState } from "react";
import { TextField } from "@mui/material";
import { InlineEditField } from "@/components/InlineEditField";

export function DescriptionEditor({
  animeId,
  descriptionPortuguese,
}: {
  animeId: string;
  descriptionPortuguese: string | null;
}) {
  const [value, setValue] = useState(descriptionPortuguese ?? "");

  async function save() {
    const res = await fetch(`/api/anime/${animeId}/description`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptionPortuguese: value.trim() || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha ao salvar");
    }
  }

  return (
    <InlineEditField
      triggerLabel={descriptionPortuguese ? "Editar descrição em português" : "Adicionar descrição em português"}
      onSave={save}
      onCancel={() => setValue(descriptionPortuguese ?? "")}
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="descrição em português (opcional)"
        size="small"
        multiline
        maxRows={8}
        fullWidth
        sx={{ minWidth: 288 }}
        slotProps={{ htmlInput: { maxLength: 5000 } }}
      />
    </InlineEditField>
  );
}
