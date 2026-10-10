"use client";

import { loginHref } from "@/lib/safeRedirect";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { ButtonBase } from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

/**
 * Ação "Curtir · N" do Figma (ReactionAction): coração de 16 px + texto de
 * 12 px, alvo de 44 px. Estado curtido = coração e texto na cor de acento.
 *
 * Extensão de FavoriteToggle (boolean otimista) pra {liked, likeCount} —
 * não existia precedente de contador otimista neste app antes do Epic 22,
 * então o rollback em falha precisa desfazer as duas coisas juntas.
 *
 * `liked`/`likeCount` vêm como props CONTROLADAS (não mais "initial" +
 * estado local próprio) — o MESMO post pode aparecer 2x na mesma página
 * do feed (ele mesmo + "Fulano repostou", ver src/lib/postFeedDto.ts), e
 * curtir numa das 2 instâncias precisa refletir na outra sem recarregar
 * (achado real da 19ª rodada de auditoria, Epic 18).
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
  // deslogado de verdade — evita disparar uma chamada que só voltaria 401.
  const loggedOut = user === null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Feed público: o botão continua visível pra quem não tem conta, mas o
    // clique leva pro login em vez de ficar inerte.
    if (loggedOut) {
      router.push(loginHref(window.location.pathname + window.location.search));
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

  return (
    <ButtonBase
      onClick={toggle}
      disabled={saving}
      aria-pressed={liked}
      title={loggedOut ? "Entre para curtir" : undefined}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        minHeight: 44,
        fontSize: 12,
        color: liked ? "primary.main" : "text.secondary",
        borderRadius: "6px",
      }}
    >
      {liked ? <FavoriteIcon sx={{ fontSize: 16 }} /> : <FavoriteBorderIcon sx={{ fontSize: 16 }} />}
      <span>Curtir · {likeCount}</span>
    </ButtonBase>
  );
}
