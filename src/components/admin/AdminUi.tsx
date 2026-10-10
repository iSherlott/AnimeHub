import type { ReactNode } from "react";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import { Box, Typography } from "@mui/material";
import { STATE_LABEL, type JobState } from "@/lib/adminImport/jobSteps";

/** Peças visuais das telas Admin (Figma "Admin UX", `8:3436…8:5077`). Só apresentação — sem estado. */

export function AdminPageHeader({ title, subtitle, action, titleCase = "normal" }: { title: string; subtitle?: ReactNode; action?: ReactNode; titleCase?: "normal" | "upper" }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 3 }}>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 32, md: 40 }, fontWeight: 400, lineHeight: 1.2, textTransform: titleCase === "upper" ? "uppercase" : "none" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography component="p" sx={{ fontSize: 16, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}

export const adminPanelSx = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  p: 3,
  borderRadius: "16px",
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  minWidth: 0,
} as const;

export function AdminPanel({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <Box component="section" data-testid={testId} sx={adminPanelSx}>
      {title && (
        <Typography component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export function StatCard({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ ...adminPanelSx, gap: 1.5 }}>
      <Typography component="p" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography component="p" sx={{ fontSize: 40, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint && (
        <Typography component="p" sx={{ fontSize: 13, color: "text.secondary" }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 3, alignItems: "stretch" }}>
      {children}
    </Box>
  );
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; width?: string };

/** Tabela do Figma: cabeçalho em caixa alta 11 px, linhas de 14 px separadas por borda fina. */
export function AdminTable<T>({ columns, rows, rowKey, caption, testId }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption: string; testId?: string }) {
  return (
    <Box sx={{ borderRadius: "12px", border: 1, borderColor: "divider", overflowX: "auto", bgcolor: "background.paper" }} data-testid={testId}>
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{caption}</caption>
        <Box component="thead" sx={{ bgcolor: "#171820" }}>
          <tr>
            {columns.map((c) => (
              <Box
                key={c.key}
                component="th"
                scope="col"
                sx={{ textAlign: "left", px: 2, py: 2, fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", width: c.width }}
              >
                {c.label}
              </Box>
            ))}
          </tr>
        </Box>
        <tbody>
          {rows.map((row) => (
            <Box key={rowKey(row)} component="tr" sx={{ borderTop: 1, borderColor: "divider" }}>
              {columns.map((c) => (
                <Box key={c.key} component="td" sx={{ px: 2, py: 2, fontSize: 14, verticalAlign: "middle", lineHeight: 1.5 }}>
                  {c.render(row)}
                </Box>
              ))}
            </Box>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** Estado do job com ícone E texto (nunca só cor): ○ Pending · ↻ Running · ✓ Success · ! Failed · ⊘ Cancelled. */
export function JobStateLabel({ state }: { state: JobState }) {
  const icon =
    state === "SUCCESS" ? <CheckCircleOutlinedIcon /> : state === "FAILED" ? <ErrorOutlineOutlinedIcon /> : state === "CANCELLED" ? <CancelOutlinedIcon /> : state === "RUNNING" ? <AutorenewOutlinedIcon /> : <PendingOutlinedIcon />;
  const color = state === "SUCCESS" ? "success.main" : state === "FAILED" ? "primary.main" : "text.primary";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color, "& svg": { fontSize: 16 } }}>
      {icon}
      <span>{STATE_LABEL[state]}</span>
    </Box>
  );
}

export function SmallChip({ children, tone = "neutral", icon }: { children: ReactNode; tone?: "neutral" | "warning" | "accent" | "success"; icon?: ReactNode }) {
  const color = tone === "warning" ? "warning.main" : tone === "accent" ? "primary.main" : tone === "success" ? "success.main" : "text.secondary";
  const bg = tone === "accent" ? "#2c111b" : "#171820";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, alignSelf: "flex-start", px: 1, py: 0.75, borderRadius: "6px", bgcolor: bg, color, "& svg": { fontSize: 14 } }}>
      {icon}
      <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit", whiteSpace: "nowrap" }}>
        {children}
      </Typography>
    </Box>
  );
}
