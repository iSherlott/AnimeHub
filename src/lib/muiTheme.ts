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
    // Contraste (VIS/WCAG AA): texto/ícone em vermelho sobre o fundo escuro
    // precisa de >= 4,5:1; o vermelho da marca (#e4002b) dá só ~4,05. Por
    // isso `main` (usado como COR DE TEXTO em links, abas, botões de
    // contorno, rótulos) é o tom mais claro, e o vermelho da marca fica nos
    // botões preenchidos (override abaixo), onde o texto branco passa.
    primary: {
      main: "#ff1a3d",
      dark: "#c50023",
      light: "#ff4d66",
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
  components: {
    // O anel de foco padrão do MUI é sutil demais em cima dos cards
    // tingidos do Descobrir (atalhos "Por gênero" etc.) e dos IconButton
    // com fundo escuro semitransparente (selo de favorito, adicionar à
    // lista) — foco por teclado ficava quase invisível neles (achado real
    // da 2ª auditoria de UX/UI, Epic 20). Aplicado em ButtonBase, a base de
    // Button/IconButton/CardActionArea, pra cobrir todo esse tipo de
    // componente de uma vez, não card por card.
    // Alvos de toque/clique >= 44 px (VIS/WCAG 2.5.8 AAA recomendado pelo
    // Figma): ícones isolados são os que mais ficavam abaixo disso.
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: 44, minHeight: 44 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ ownerState }) =>
          ownerState.variant === "contained" && ownerState.color === "primary"
            ? { backgroundColor: "#e4002b", "&:hover": { backgroundColor: "#c50023" } }
            : {},
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          "&.Mui-focusVisible": {
            // Offset negativo (pra dentro), não positivo — MuiCard tem
            // overflow:hidden por padrão pra cortar cantos arredondados
            // em cima de imagem, e um outline com offset positivo (pra
            // fora) fica cortado pelo Card ancestral, invisível de
            // verdade apesar da classe Mui-focusVisible estar aplicada
            // (só descoberto testando foco de teclado ao vivo, não só
            // lendo o CSS).
            outline: "2px solid #ffd400",
            outlineOffset: -2,
          },
        },
      },
    },
  },
});
