"use client";

import { loginHref, readNextFromLocation } from "@/lib/safeRedirect";
import { Suspense, useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Alert, Link as MuiLink, TextField, Typography } from "@mui/material";
import { Header } from "@/components/Header";
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
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 384, width: "100%", mx: "auto", px: 3, py: 8 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
        Criar conta
      </Typography>
      <Typography variant="caption" sx={{ display: "block", mb: 3, color: "text.secondary" }}>
        Cadastro é só por convite — peça o código a um administrador. (A
        primeiríssima conta do sistema não precisa de convite.)
      </Typography>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField
          type="text"
          label="Código de convite"
          // O rótulo dizia "(opcional)" incondicionalmente, mas a rota
          // (POST /api/auth/signup) só aceita em branco pra primeiríssima
          // conta do sistema — enganoso pra qualquer pessoa recebendo um
          // convite de verdade, a esmagadora maioria de quem vê esta tela
          // (achado real da 14ª rodada de auditoria, Epic 18).
          helperText="Peça a um administrador — só fica em branco na 1ª conta do sistema"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          fullWidth
        />
        <TextField
          type="text"
          required
          label="Nome de exibição"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          fullWidth
        />
        <TextField
          type="email"
          required
          label="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
        />
        <TextField
          type="password"
          required
          slotProps={{ htmlInput: { minLength: 8 } }}
          label="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" loading={loading} sx={{ mt: 1 }}>
          Criar conta
        </Button>
      </Box>
      <Typography variant="body2" sx={{ mt: 3, color: "text.secondary" }}>
        Já tem conta?{" "}
        <MuiLink component={NextLink} href="/login" onClick={(e: React.MouseEvent) => { e.preventDefault(); router.push(loginHref(new URLSearchParams(window.location.search).get("next"))); }} color="inherit">
          Entrar
        </MuiLink>
      </Typography>
    </Box>
  );
}

export default function SignupPage() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Header />
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </Box>
  );
}
