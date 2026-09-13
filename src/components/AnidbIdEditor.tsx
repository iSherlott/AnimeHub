"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link as MuiLink, TextField } from "@mui/material";
import { InlineEditField } from "@/components/InlineEditField";

export function AnidbIdEditor({
  animeId,
  anidbId,
}: {
  animeId: string;
  anidbId: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(anidbId?.toString() ?? "");

  async function save() {
    await fetch(`/api/anime/${animeId}/anidb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anidbId: value.trim() ? Number(value.trim()) : null }),
    });
    router.refresh();
  }

  return (
    <InlineEditField
      triggerLabel={anidbId ? `AniDB #${anidbId} · editar` : "Vincular ID da AniDB"}
      onSave={save}
      extraContent={
        <MuiLink
          href="https://anidb.net/"
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          color="error"
        >
          buscar no site ↗
        </MuiLink>
      }
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ID numérico (ex: 15617)"
        size="small"
        sx={{ width: 176 }}
      />
    </InlineEditField>
  );
}
