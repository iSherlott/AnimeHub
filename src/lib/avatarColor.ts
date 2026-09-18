/**
 * Cor de identidade determinística por autor/anime, sem depender de
 * upload de avatar (esse continua sem infraestrutura própria — Epic 26
 * deu upload real só pra imagem de POST, não pra avatar de usuário; nem
 * `User.avatarUrl` é usado pra exibir nada). Extraído de PostCard.tsx
 * (onde nasceu, Epic 22/25) — reaproveitado agora também pelo avatar do
 * compositor e pela linha "Posts em alta" da lateral do Feed (Epic 26).
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

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}
