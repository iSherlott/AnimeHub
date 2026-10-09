"use client";

import { useState } from "react";
import { TextField } from "@mui/material";
import { InlineEditField } from "@/components/InlineEditField";

export function BioEditor({ bio }: { bio: string | null }) {
  const [value, setValue] = useState(bio ?? "");

  async function save() {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: value.trim() || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha ao salvar");
    }
  }

  return (
    <InlineEditField
      triggerLabel={bio ? "Editar bio" : "Adicionar bio"}
      onSave={save}
      onCancel={() => setValue(bio ?? "")}
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="uma frase sobre você (opcional)"
        size="small"
        multiline
        maxRows={4}
        fullWidth
        sx={{ minWidth: 288 }}
        slotProps={{ htmlInput: { maxLength: 300 } }}
      />
    </InlineEditField>
  );
}
