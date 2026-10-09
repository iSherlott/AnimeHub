"use client";

import { useState } from "react";
import { TextField } from "@mui/material";
import { InlineEditField } from "@/components/InlineEditField";

export function TitleEditor({
  animeId,
  titlePortuguese,
}: {
  animeId: string;
  titlePortuguese: string | null;
}) {
  const [value, setValue] = useState(titlePortuguese ?? "");

  async function save() {
    const res = await fetch(`/api/anime/${animeId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titlePortuguese: value.trim() || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha ao salvar");
    }
  }

  return (
    <InlineEditField
      triggerLabel={titlePortuguese ? "Editar título em português" : "Adicionar título em português"}
      onSave={save}
      onCancel={() => setValue(titlePortuguese ?? "")}
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="título em português (opcional)"
        size="small"
        sx={{ width: 256 }}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
    </InlineEditField>
  );
}
