"use client";

import { useId, useState, type ReactNode } from "react";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Box, IconButton, InputBase, Typography } from "@mui/material";
import { Header } from "@/components/Header";

/**
 * Casca de Entrar/Criar conta (Figma `8:2371`): painel de arte à esquerda com
 * a promessa do produto e o formulário à direita (456 px). Em telas estreitas
 * o painel de arte some e o formulário ocupa a largura.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Header />
      <Box
        component="main"
        sx={{
          flex: 1,
          width: "100%",
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 2, sm: 4, md: 8 },
          py: { xs: 5, md: 10 },
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 616px) minmax(0, 1fr)" },
          columnGap: { md: 10 },
          alignItems: "center",
        }}
      >
        <Box
          aria-hidden
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: 2,
            minHeight: 660,
            p: 5,
            borderRadius: "16px",
            overflow: "hidden",
            position: "relative",
            background:
              "radial-gradient(circle at 24% 46%, rgba(255,176,64,0.30), transparent 9%), radial-gradient(circle at 62% 40%, rgba(255,160,64,0.26), transparent 8%), radial-gradient(circle at 44% 66%, rgba(255,190,90,0.34), transparent 12%), radial-gradient(ellipse at 50% 20%, rgba(40,90,80,0.55), transparent 60%), linear-gradient(180deg, #0d1816 0%, #0a100f 55%, #08080b 100%)",
          }}
        >
          <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #08080b 0%, rgba(8,8,11,0.55) 45%, transparent 75%)" }} />
          <Box sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <Box sx={{ px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#2c111b" }}>
              <Typography component="span" lang="ja" sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}>
                あなたの時間 / SEU TEMPO
              </Typography>
            </Box>
            <Typography component="p" sx={{ fontSize: 40, lineHeight: 1.5 }}>
              A próxima estreia. Na sua agenda.
            </Typography>
            <Typography sx={{ fontSize: 16, lineHeight: 1.5, maxWidth: 480 }}>
              Acompanhe animes e receba atualizações de lançamento. Sem progresso de consumo, sem distrações.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", maxWidth: 456, mx: { xs: "auto", md: 0 } }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 32, md: 40 }, fontWeight: 400, lineHeight: 1.3 }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: 16, color: "text.secondary" }}>{subtitle}</Typography>
          </Box>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/** Campo do Figma: rótulo de 12 px acima, entrada "surface" de raio 10 e ícone/ação à direita. */
export function AuthField({
  label,
  value,
  onChange,
  type = "text",
  required,
  minLength,
  helper,
  endIcon,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password";
  required?: boolean;
  minLength?: number;
  helper?: string;
  endIcon?: ReactNode;
  autoComplete?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography component="label" htmlFor={id} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.75,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: "10px",
          "&:focus-within": { borderColor: "text.secondary" },
        }}
      >
        <InputBase
          id={id}
          type={isPassword && visible ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          inputProps={{ minLength }}
          fullWidth
          sx={{ fontSize: 14, p: 0, "& input": { p: 0 } }}
        />
        {isPassword ? (
          <IconButton
            size="small"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            sx={{ color: "text.primary", p: 0.25 }}
          >
            {visible ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        ) : (
          endIcon && <Box sx={{ display: "flex", color: "text.primary", "& svg": { fontSize: 18 } }}>{endIcon}</Box>
        )}
      </Box>
      {helper && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{helper}</Typography>}
    </Box>
  );
}
