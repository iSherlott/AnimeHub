import { Avatar } from "@mui/material";
import { initials } from "@/lib/avatarColor";

/**
 * Avatar de usuário (Epic 28) — mostra a imagem real quando existe
 * (`User.avatarUrl`), senão cai nas iniciais coloridas determinísticas
 * já usadas em todo o app (`src/lib/avatarColor.ts`). Centraliza esse
 * fallback num só lugar em vez de repetir `avatarUrl ? <Avatar src> :
 * <Avatar>{initials}</Avatar>` em cada componente que mostra autor.
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
  if (avatarUrl) {
    return <Avatar src={avatarUrl} alt={displayName} sx={{ width: size, height: size }} />;
  }
  // Avatar de iniciais do Figma: círculo "elevated" com iniciais secundárias
  // (11 px aos 28 px, 12 px aos 36 px); o id só entra como semente de cor se
  // for pedido explicitamente no futuro.
  void id;
  return (
    <Avatar
      sx={{
        bgcolor: "#171820",
        color: "text.secondary",
        width: size,
        height: size,
        fontSize: size >= 36 ? 12 : 11,
        fontWeight: 700,
      }}
    >
      {initials(displayName)}
    </Avatar>
  );
}
