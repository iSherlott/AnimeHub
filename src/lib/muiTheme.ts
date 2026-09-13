import { createTheme } from "@mui/material/styles";

/**
 * Tema MUI padrão (Material look, sem tentar reproduzir os motivos "Shounen
 * Jump" — decisão explícita do Epic 12: menos esforço de tema, aceitar o
 * visual padrão do Material). Só a paleta de cores é reaproveitada dos
 * tokens que já existiam em src/app/globals.css.
 */
export const muiTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0b0b0d",
      paper: "#18171c",
    },
    primary: {
      main: "#e4002b",
      dark: "#c50023",
      light: "#ff1a3d",
      contrastText: "#f7f7f5",
    },
    secondary: {
      main: "#ffd400",
      contrastText: "#0b0b0d",
    },
    text: {
      primary: "#f7f7f5",
      secondary: "#9b98a1",
    },
    divider: "#2c2b31",
  },
  typography: {
    fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  },
  shape: {
    borderRadius: 6,
  },
});

/**
 * Cores de status de progresso (Assistindo/Completo/etc.) — mantidas como
 * constantes simples em vez de estender o tipo da paleta do MUI, seguindo a
 * mesma linha de "menos cerimônia de tema" do restante da migração.
 */
export const statusColors = {
  watching: "#2e6ff2",
  completed: "#22c55e",
  planned: "#ffd400",
  paused: "#c08a2e",
  dropped: "#52525b",
} as const;
