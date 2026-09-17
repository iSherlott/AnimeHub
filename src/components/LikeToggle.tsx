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
 *
 * `liked`/`likeCount` vêm como props CONTROLADAS (não mais "initial" +
 * estado local próprio) — o MESMO post pode aparecer 2x na mesma página
 * do feed (ele mesmo + "Fulano repostou", ver src/lib/postFeedDto.ts), e
 * curtir numa das 2 instâncias precisa refletir na outra sem recarregar.
 * `commentCount`/`repostedByMe` já passaram por essa mesma correção na
 * 18ª rodada de auditoria (Epic 18) — este componente tinha ficado de
 * fora daquela leva e carregava exatamente o mesmo bug (achado real da
 * 19ª rodada): curtir/descurtir só atualizava a instância clicada, a
 * outra ficava com o coração/contador desatualizado até recarregar.
 */
export function LikeToggle({
  postId,
  liked,
  likeCount,
  onChange,
}: {
  postId: string;
  liked: boolean;
  likeCount: number;
  onChange: (postId: string, liked: boolean, likeCount: number) => void;
}) {
  const user = useCurrentUser();
  const router = useRouter();
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
    const prevLiked = liked;
    const prevCount = likeCount;
    onChange(postId, next, likeCount + (next ? 1 : -1));
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: next }),
      });
      if (!res.ok) {
        onChange(postId, prevLiked, prevCount);
        return;
      }
      const data = await res.json();
      onChange(postId, data.liked, data.likeCount);
    } catch {
      onChange(postId, prevLiked, prevCount);
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
