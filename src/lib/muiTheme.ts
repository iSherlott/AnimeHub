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
    // Tokens do Figma: background / surface / elevated / border / primary /
    // secondary / accent. O acento (#ff164f) tem >= 4,5:1 sobre background,
    // surface e elevated; texto SOBRE o acento usa o próprio background
    // (#08080b), como nos botões "+ Nova publicação" e "Publicar".
    background: {
      default: "#08080b",
      paper: "#101116",
    },
    primary: {
      main: "#ff164f",
      dark: "#e0113f",
      light: "#ff4d77",
      contrastText: "#08080b",
    },
    secondary: {
      main: "#ffd400",
      contrastText: "#08080b",
    },
    text: {
      primary: "#f2f2f5",
      secondary: "#92939d",
    },
    divider: "#272832",
  },
  typography: {
    fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
    // Escala do Figma (Inter 11/12/13/14/16/20/26/40, entrelinha 1,5).
    h3: { fontWeight: 400, fontSize: 40, lineHeight: 1.2 },
    h4: { fontWeight: 400, fontSize: 26, lineHeight: 1.5 },
    h5: { fontWeight: 400, fontSize: 20, lineHeight: 1.5 },
    h6: { fontWeight: 400, fontSize: 20, lineHeight: 1.5 },
    body1: { fontSize: 16, lineHeight: 1.5 },
    body2: { fontSize: 14, lineHeight: 1.5 },
    caption: { fontSize: 12, lineHeight: 1.5 },
    overline: { fontSize: 12, fontWeight: 700, letterSpacing: 0, lineHeight: 1.5 },
    button: { fontWeight: 700, textTransform: "none", fontSize: 14 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    // Subtítulos são texto, não títulos: por padrão o MUI os renderiza como <h6>, o que quebrava a ordem dos títulos.
    MuiTypography: {
      defaultProps: { variantMapping: { subtitle1: "p", subtitle2: "p" } },
    },
    // Foco pelo teclado nos campos (texto, seletor): o MUI tira o contorno do <input>/<select>, então o anel amarelo do
    // site vai no contorno do campo inteiro.
    MuiInputBase: {
      styleOverrides: {
        root: { "&:has(:focus-visible)": { outline: "2px solid #ffd400", outlineOffset: 2 } },
      },
    },
    // Alvos de toque/clique >= 44 px (VIS/WCAG 2.5.8 AAA recomendado pelo
    // Figma): ícones isolados são os que mais ficavam abaixo disso.
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: 44, minHeight: 44 },
      },
    },
    // Botões do Figma: altura mínima 44, raio 10, padding 12x16, sem caixa alta.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 10, padding: "12px 16px", textTransform: "none", fontWeight: 700 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontSize: 14,
          fontWeight: 400,
          minHeight: 48,
          paddingLeft: 0,
          paddingRight: 0,
          minWidth: 0,
          color: "#92939d",
          // Aba selecionada do Figma: texto primário em negrito + indicador de acento.
          "&.Mui-selected": { color: "#f2f2f5", fontWeight: 700 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 48, borderBottom: "1px solid #272832" },
        list: { gap: 32 },
        indicator: { height: 2, backgroundColor: "#ff164f" },
      },
    },
    // O anel de foco padrão do MUI é sutil demais em cima dos cards
    // tingidos do Descobrir e dos IconButton com fundo escuro — foco por
    // teclado ficava quase invisível neles (achado real da 2ª auditoria de
    // UX/UI, Epic 20). Aplicado em ButtonBase, a base de Button/IconButton/
    // CardActionArea, pra cobrir todo esse tipo de componente de uma vez.
    MuiButtonBase: {
      styleOverrides: {
        root: {
          "&.Mui-focusVisible": {
            // Offset negativo (pra dentro): MuiCard tem overflow:hidden e um
            // outline pra fora ficaria cortado (invisível de verdade).
            outline: "2px solid #ffd400",
            outlineOffset: -2,
          },
        },
      },
    },
  },
});
