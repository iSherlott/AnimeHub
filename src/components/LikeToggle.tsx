"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

/**
 * Extensão de FavoriteToggle (boolean otimista) pra {liked, likeCount} —
 * não existia precedente de contador otimista neste app antes do Epic 22,
 * então o rollback em falha precisa desfazer as duas coisas juntas.
 */
export function LikeToggle({
  postId,
  initialLiked,
  initialLikeCount,
}: {
  postId: string;
  initialLiked: boolean;
  initialLikeCount: number;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [saving, setSaving] = useState(false);

  // user === null (não undefined, que é "ainda carregando") é o caso
  // deslogado de verdade — evita disparar uma chamada que só voltaria 401,
  // mesmo padrão de FollowToggle na página de perfil público.
  const loggedOut = user === null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Feed público (Instagram/Twitter): o ícone continua visível pra quem
    // não tem conta, mas o clique leva pro login em vez de ficar inerte
    // (achado real do pedido de redesenho do Feed) — antes o botão só
    // ficava `disabled`, sem indicar o que fazer pra curtir de verdade.
    if (loggedOut) {
      router.push("/login");
      return;
    }
    const next = !liked;
    const prevCount = likeCount;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: next }),
      });
      if (!res.ok) {
        setLiked(!next);
        setLikeCount(prevCount);
        return;
      }
      const data = await res.json();
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount(prevCount);
    } finally {
      setSaving(false);
    }
  }

  const label = liked ? "Descurtir" : "Curtir";

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Tooltip title={loggedOut ? "Entre para curtir" : label}>
        <span>
          <IconButton
            onClick={toggle}
            disabled={saving}
            aria-label={label}
            size="small"
          >
            {liked ? (
              <FavoriteIcon fontSize="small" sx={{ color: "primary.main" }} />
            ) : (
              <FavoriteBorderIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 16 }}>
        {likeCount}
      </Typography>
    </Stack>
  );
}
