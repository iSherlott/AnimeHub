/**
 * Cor de identidade determinística por autor/anime — usada como
 * fallback sempre que não há avatar de verdade pra mostrar (`User.
 * avatarUrl` ganhou upload real no Epic 28; até lá, nunca era escrito
 * nem lido em lugar nenhum). Extraído de PostCard.tsx (onde nasceu,
 * Epic 22/25) — reaproveitado também pelo avatar do compositor e pela
 * linha "Posts em alta" da lateral do Feed (Epic 26), e por
 * `UserAvatar.tsx` (Epic 28) como fallback de iniciais.
 */
export const AVATAR_COLORS = ["#7C4DFF", "#00BFA5", "#FF6D00", "#2979FF", "#D500F9", "#FFAB00", "#F50057"];

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export function avatarColor(authorId: string): string {
  return AVATAR_COLORS[hashString(authorId) % AVATAR_COLORS.length];
}

/** Mesma paleta, hasheada por anilistId em vez de autor — fundo do
 * bloco-capa de texto quando o post não tem imagem (Epic 25). */
export function coverColor(anilistId: number): string {
  return AVATAR_COLORS[hashString(String(anilistId)) % AVATAR_COLORS.length];
}

/** Até 2 iniciais (primeira letra das duas primeiras palavras), como no Figma ("Lia Sato" → "LS", "Akira" → "A"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

/** Luminância relativa WCAG de uma cor #rrggbb. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Cor de texto (branco ou quase preto) com MAIOR contraste sobre `background`
 * (#rrggbb) — a paleta tem tons claros (âmbar, ciano) onde branco falhava
 * o AA do axe (achado de F14).
 */
export function readableTextColor(background: string): string {
  const lum = relativeLuminance(background);
  const onWhite = 1.05 / (lum + 0.05);
  const onDark = (lum + 0.05) / (relativeLuminance("#0b0b0d") + 0.05);
  return onWhite >= onDark ? "#ffffff" : "#0b0b0d";
}
