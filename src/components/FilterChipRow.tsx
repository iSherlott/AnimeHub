import { Box, Chip, Typography } from "@mui/material";

export function FilterChipRow({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onChange: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 0.75, sm: 2 }, alignItems: { sm: "flex-start" } }}>
      <Typography variant="overline" sx={{ width: 96, flexShrink: 0, color: "text.secondary", pt: { sm: 0.5 } }}>
        {label}
      </Typography>
      <Box
        className="no-scrollbar"
        sx={{ display: "flex", gap: 1, overflowX: "auto", flexWrap: { sm: "wrap" } }}
      >
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Chip
              key={opt.value}
              label={opt.label}
              onClick={() => onChange(active ? null : opt.value)}
              color={active ? "primary" : "default"}
              variant={active ? "filled" : "outlined"}
              aria-pressed={active}
              size="small"
              sx={{ flexShrink: 0, fontWeight: 700, textTransform: "uppercase" }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
