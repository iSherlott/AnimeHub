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
    const trimmed = value.trim();
    // Validar aqui, não só confiar no servidor — antes, um valor não
    // numérico virava NaN, serializava como null no JSON e era aceito em
    // silêncio como "sem ID vinculado nenhum", sem aviso nenhum pra quem
    // digitou errado (achado real da 5ª rodada de auditoria, Epic 18).
    if (trimmed && !/^\d+$/.test(trimmed)) {
      throw new Error("ID da AniDB deve ser um número inteiro positivo");
    }
    const res = await fetch(`/api/anime/${animeId}/anidb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anidbId: trimmed ? Number(trimmed) : null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha ao salvar");
    }
    router.refresh();
  }

  return (
    <InlineEditField
      triggerLabel={anidbId ? `AniDB #${anidbId} · editar` : "Vincular ID da AniDB"}
      onSave={save}
      onCancel={() => setValue(anidbId?.toString() ?? "")}
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
