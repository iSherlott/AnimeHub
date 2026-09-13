"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [value, setValue] = useState(titlePortuguese ?? "");

  async function save() {
    await fetch(`/api/anime/${animeId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titlePortuguese: value.trim() || null }),
    });
    router.refresh();
  }

  return (
    <InlineEditField
      triggerLabel={titlePortuguese ? "Editar título em português" : "Adicionar título em português"}
      onSave={save}
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="título em português (opcional)"
        size="small"
        sx={{ width: 256 }}
      />
    </InlineEditField>
  );
}
