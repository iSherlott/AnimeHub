"use client";

import { loginHref, readNextFromLocation } from "@/lib/safeRedirect";
import { Suspense, useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import { Box, Button, Alert, Link as MuiLink, Typography } from "@mui/material";
import { AuthField, AuthShell } from "@/components/AuthShell";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Já logado não tem o que fazer aqui — manda pra home em vez de deixar o
  // formulário reaparecer (achado real da auditoria: item baixo do Epic 21).
  useEffect(() => {
    if (user) router.replace(readNextFromLocation());
  }, [user, router]);

  if (user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar conta");
        return;
      }
      router.push(readNextFromLocation());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Criar conta no ANIME HUB"
      subtitle="Cadastro é só por convite — peça o código a um administrador. (A primeiríssima conta do sistema não precisa de convite.)"
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {/* O rótulo dizia "(opcional)" incondicionalmente, mas a rota só aceita em branco
            pra primeiríssima conta do sistema — enganoso pra quem recebeu um convite
            (achado real da 14ª rodada de auditoria, Epic 18). */}
        <AuthField
          label="Código de convite"
          value={inviteCode}
          onChange={setInviteCode}
          helper="Peça a um administrador — só fica em branco na 1ª conta do sistema"
        />
        <AuthField label="Nome de exibição" required value={displayName} onChange={setDisplayName} />
        <AuthField label="E-mail" type="email" required autoComplete="email" value={email} onChange={setEmail} endIcon={<MailOutlinedIcon />} />
        <AuthField label="Senha (mín. 8 caracteres)" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={setPassword} />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box>
          <Button type="submit" variant="contained" loading={loading} sx={{ textTransform: "uppercase" }}>
            Criar conta
          </Button>
        </Box>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Já tem conta?{" "}
          <MuiLink component={NextLink} href="/login" onClick={(e: React.MouseEvent) => { e.preventDefault(); router.push(loginHref(new URLSearchParams(window.location.search).get("next"))); }} color="inherit">
            Entrar
          </MuiLink>
        </Typography>
      </Box>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
