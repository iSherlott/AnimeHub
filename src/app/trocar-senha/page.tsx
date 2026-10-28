"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import { Alert, Box, Button, Typography } from "@mui/material";
import { AuthField, AuthShell } from "@/components/AuthShell";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";
import { readNextFromLocation } from "@/lib/safeRedirect";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Troca de senha. Obrigatória para quem entrou com a senha provisória que o admin entregou (conta nova ou senha
 * redefinida): até trocar, o resto do site não abre. Também serve para quem quiser trocar a própria senha
 * (Configurações → Senha).
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const setUser = useSetCurrentUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const provisional = Boolean(user?.mustChangePassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("A confirmação não é igual à nova senha.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível trocar a senha.");
        return;
      }
      setUser(data.user);
      router.replace(readNextFromLocation("/"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title={provisional ? "Crie sua senha" : "Trocar senha"}
      subtitle={provisional ? "Você entrou com a senha provisória que a administração entregou. Escolha a sua para continuar." : "Confirme a senha atual e escolha a nova."}
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <AuthField label={provisional ? "Senha provisória" : "Senha atual"} type="password" required autoComplete="current-password" value={current} onChange={setCurrent} />
        <AuthField label="Nova senha" type="password" required minLength={MIN_PASSWORD_LENGTH} helper={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`} autoComplete="new-password" value={next} onChange={setNext} />
        <AuthField label="Confirme a nova senha" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box>
          <Button type="submit" variant="contained" loading={saving} startIcon={<CheckIcon />} sx={{ textTransform: "uppercase" }}>
            Salvar senha
          </Button>
        </Box>
        {provisional && (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Ao salvar, a senha provisória deixa de valer e as outras sessões abertas com ela são encerradas.
          </Typography>
        )}
      </Box>
    </AuthShell>
  );
}
