"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import { UserAvatar } from "@/components/UserAvatar";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";
import { uploadAvatar } from "@/lib/uploadImage";

/**
 * Avatar grande do próprio perfil (Epic 28), com um botão sobreposto
 * que abre o seletor de arquivo — só renderizado quando `isOwnProfile`
 * (ver ProfileHeader). Não é um `InlineEditField` porque não é um
 * campo de texto com "salvar/cancelar": a troca é imediata ao escolher
 * o arquivo, com o próprio ícone virando spinner enquanto envia.
 *
 * `router.refresh()` sozinho não atualiza o avatar do header/AccountMenu
 * — aquele vem do `CurrentUserContext`, que só refaz `/api/auth/me` numa
 * troca de ROTA (`useCurrentUser.tsx`), e trocar o próprio avatar
 * acontece sem sair de `/users/[id]`. Por isso usa `useSetCurrentUser()`
 * também, mesmo padrão já usado pelo logout no Header pra refletir na
 * hora sem esperar o próximo poll.
 */
export function AvatarUploader({
  userId,
  displayName,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const setCurrentUser = useSetCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function syncHeaderAvatar(nextAvatarUrl: string | null) {
    if (currentUser) setCurrentUser({ ...currentUser, avatarUrl: nextAvatarUrl });
  }

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de um erro
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const { avatarUrl: nextAvatarUrl } = await uploadAvatar(file);
      syncHeaderAvatar(nextAvatarUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar avatar");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover avatar");
      syncHeaderAvatar(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover avatar");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Box>
      <Box sx={{ position: "relative", width: 96, height: 96 }}>
        <UserAvatar id={userId} displayName={displayName} avatarUrl={avatarUrl} size={96} />
        <IconButton
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Trocar foto de perfil"
          size="small"
          sx={{
            position: "absolute",
            right: -4,
            bottom: -4,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          {uploading ? <CircularProgress size={16} /> : <PhotoCameraIcon fontSize="small" />}
        </IconButton>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleChange}
        />
      </Box>
      {avatarUrl && !uploading && (
        <Button
          onClick={handleRemove}
          size="small"
          sx={{ mt: 0.5, px: 0, minWidth: 0, fontSize: 11, textTransform: "none", color: "text.secondary" }}
        >
          remover foto
        </Button>
      )}
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5, maxWidth: 160 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
