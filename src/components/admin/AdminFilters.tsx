"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box } from "@mui/material";
import { SearchField, SelectField } from "@/components/FilterField";

export type AdminFilterField =
  | { kind: "search"; name: string; label: string; placeholder?: string; value: string }
  | { kind: "select"; name: string; label: string; value: string; options: Array<{ value: string; label: string }>; width?: number | string };

/**
 * Filtros das listas Admin (busca + seletores do Figma): o estado vive na URL
 * (`?q=…&estado=…`), então a lista é uma página de servidor compartilhável e o
 * botão voltar restaura o filtro. A busca espera 350 ms depois de digitar.
 */
export function AdminFilters({ fields, keep = {} }: { fields: AdminFilterField[]; keep?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value])));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function push(next: Record<string, string>) {
    // `keep`: parâmetros fixos da página (ex.: a obra escolhida em Episódios), que os filtros não mostram mas não podem perder.
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keep, ...next })) if (value) params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function change(name: string, value: string, debounce: boolean) {
    const next = { ...values, [name]: value };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => push(next), 350);
    else push(next);
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
      {fields.map((f) =>
        f.kind === "search" ? (
          <SearchField key={f.name} label={f.label} value={values[f.name]} placeholder={f.placeholder} onChange={(v) => change(f.name, v, true)} />
        ) : (
          <SelectField key={f.name} label={f.label} value={values[f.name]} options={f.options} width={f.width ?? 176} onChange={(v) => change(f.name, v, false)} />
        )
      )}
    </Box>
  );
}
