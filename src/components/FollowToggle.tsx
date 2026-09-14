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
  /** Pra quem mantém um contador de seguidores local (ex.: página de
   * perfil) ajustar otimisticamente junto com o toggle. */
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    onChange?.(next);
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
      }
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
