import { Avatar } from "@mui/material";

/** Foto padrão de quem não escolheu um avatar (substitui as iniciais). */
export const DEFAULT_AVATAR_SRC = "/avatar-padrao.svg";

/**
 * Avatar de usuário (Epic 28) — mostra a imagem escolhida quando existe
 * (`User.avatarUrl`), senão a foto padrão (`public/avatar-padrao.svg`).
 * Centraliza esse fallback num só lugar em vez de repetir em cada componente
 * que mostra autor.
 */
export function UserAvatar({
  id,
  displayName,
  avatarUrl,
  size = 36,
}: {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  // O id só entraria como semente de cor/imagem se for pedido no futuro.
  void id;
  return <Avatar src={avatarUrl || DEFAULT_AVATAR_SRC} alt={displayName} sx={{ width: size, height: size, bgcolor: "#171820" }} />;
}
