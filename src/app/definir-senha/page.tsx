"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import { Alert, Box, Button, Typography } from "@mui/material";
import { AuthField, AuthShell } from "@/components/AuthShell";
import { useSetCurrentUser } from "@/lib/auth/useCurrentUser";

const MIN_PASSWORD_LENGTH = 8;

type LinkState = { status: "loading" } | { status: "ok"; displayName: string } | { status: "invalid"; error: string };

/**
 * Definir a senha pelo link de uso único que a administração mandou (conta nova ou "esqueci a senha"). Não precisa de
 * senha provisória: o link é a prova. Ao salvar, a pessoa já entra.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const setUser = useSetCurrentUser();
  // O código vem do endereço; só o envio do formulário precisa dele.
  const codeRef = useRef("");
  const [link, setLink] = useState<LinkState>({ status: "loading" });
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("codigo") ?? "";
    codeRef.current = value;
    let cancelled = false;
    fetch(`/api/auth/password-link?codigo=${encodeURIComponent(value)}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        setLink(ok ? { status: "ok", displayName: data.displayName } : { status: "invalid", error: data.error ?? "Este link não é válido. Peça um novo à administração." });
      })
      .catch(() => !cancelled && setLink({ status: "invalid", error: "Não foi possível conferir o link agora. Tente de novo." }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("A confirmação não é igual à nova senha.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codeRef.current, password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 410) setLink({ status: "invalid", error: data.error });
        else setError(data.error ?? "Não foi possível salvar a senha.");
        return;
      }
      setUser(data.user);
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  if (link.status !== "ok") {
    return (
      <AuthShell title="Definir senha" subtitle={link.status === "loading" ? "Conferindo o link…" : "Não deu para usar este link."}>
        {link.status === "invalid" && (
          <Alert severity="warning" role="alert" data-testid="password-link-invalid">
            {link.error}
          </Alert>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crie sua senha" subtitle={`Olá, ${link.displayName}! Escolha a senha que você vai usar para entrar no AnimeHub.`}>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <AuthField label="Nova senha" type="password" required minLength={MIN_PASSWORD_LENGTH} helper={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`} autoComplete="new-password" value={next} onChange={setNext} />
        <AuthField label="Confirme a nova senha" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box>
          <Button type="submit" variant="contained" loading={saving} startIcon={<CheckIcon />} sx={{ textTransform: "uppercase" }}>
            Salvar e entrar
          </Button>
        </Box>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          O link vale uma vez só. Ao salvar, qualquer senha anterior deixa de valer e você já entra.
        </Typography>
      </Box>
    </AuthShell>
  );
}
