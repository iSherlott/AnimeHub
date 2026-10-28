"use client";

import { useId } from "react";
import SearchIcon from "@mui/icons-material/Search";
import { Box, ButtonBase, InputBase, NativeSelect, Typography } from "@mui/material";

const labelSx = { fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: "text.secondary" } as const;

const fieldBoxSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  p: 2,
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: "10px",
  "&:focus-within": { borderColor: "text.secondary" },
} as const;

/** Campo "Encontre um anime" do Figma (`8:1388`): rótulo + entrada "surface" com lupa. */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Box component="form" onSubmit={(e) => e.preventDefault()} sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: "1 1 280px" }}>
      <Typography component="label" htmlFor={id} sx={labelSx}>
        {label}
      </Typography>
      <Box sx={fieldBoxSx}>
        <InputBase
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          fullWidth
          inputProps={{ maxLength: 80 }}
          sx={{ fontSize: 14, p: 0, "& input": { p: 0 } }}
        />
        <ButtonBase type="submit" aria-label="Buscar" sx={{ color: "text.primary", minWidth: 24, minHeight: 22, borderRadius: "6px" }}>
          <SearchIcon sx={{ fontSize: 18 }} />
        </ButtonBase>
      </Box>
    </Box>
  );
}

/** Seletor rotulado do Figma (Gênero / Temporada / Ano / Tipo / Status): `<select>` nativo com a pele "surface". */
export function SelectField({
  label,
  value,
  onChange,
  options,
  width = 204,
  testId,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  width?: number | string;
  testId?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: { xs: "100%", sm: width }, flex: { xs: "1 1 200px", sm: "0 0 auto" } }}>
      <Typography component="label" htmlFor={id} sx={labelSx}>
        {label}
      </Typography>
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        disableUnderline
        inputProps={{ id, "data-testid": testId } as Record<string, unknown>}
        sx={{
          ...fieldBoxSx,
          p: 0,
          gap: 0,
          fontSize: 14,
          "& select": { p: 2, pr: "40px !important", minHeight: "unset", lineHeight: 1.5, borderRadius: "10px" },
          "& .MuiNativeSelect-icon": { right: 14, color: "text.primary" },
          "& option": { bgcolor: "background.paper", color: "text.primary" },
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </Box>
  );
}
