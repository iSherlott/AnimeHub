import { Avatar } from "@mui/material";
import { avatarColor, initials } from "@/lib/avatarColor";

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
  return (
    <Avatar
      sx={{ bgcolor: avatarColor(id), width: size, height: size, fontSize: size * 0.42, fontWeight: 700 }}
    >
      {initials(displayName)}
    </Avatar>
  );
}
