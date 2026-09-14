"use client";

import { useState } from "react";
import { Button } from "@mui/material";

export function FollowToggle({
  userId,
  initialFollowing,
  disabled,
  onChange,
}: {
  userId: string;
  initialFollowing: boolean;
  /** Pra viewer deslogado — evita a chamada (que voltaria 401) em vez de
   * só deixar o rollback lidar com a falha. */
  disabled?: boolean;
  /** Chamado só depois do servidor confirmar o follow/unfollow (sucesso
   * ou rollback em falha) — nunca antes. Um FollowToggle que dispara
   * isso ainda no clique, otimista, fazia quem escuta (ex.: refetch do
   * feed "Seguindo" nas sugestões) correr na frente do PATCH de verdade
   * e buscar o estado antigo do servidor (achado real da 4ª rodada de
   * auditoria, Epic 18) — o próprio label do botão continua trocando na
   * hora via `following`, só o callback externo espera a confirmação. */
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ following: next }),
      });
      if (!res.ok) {
        // Rollback — mesma lógica de FavoriteToggle: sem isso o botão
        // ficava "seguindo" na tela mesmo quando a chamada falhava.
        setFollowing(!next);
        onChange?.(!next);
        return;
      }
      onChange?.(next);
    } catch {
      setFollowing(!next);
      onChange?.(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      onClick={toggle}
      disabled={saving || disabled}
      variant={following ? "outlined" : "contained"}
      size="small"
    >
      {following ? "Seguindo" : "Seguir"}
    </Button>
  );
}
