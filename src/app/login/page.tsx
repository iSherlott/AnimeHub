"use client";

import { readNextFromLocation, signupHref } from "@/lib/safeRedirect";
import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Alert, Link as MuiLink, TextField, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

export default function LoginPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao entrar");
        return;
      }
      router.push(readNextFromLocation());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Header />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 384, width: "100%", mx: "auto", px: 3, py: 8 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
          Entrar
        </Typography>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
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
            label="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" loading={loading} sx={{ mt: 1 }}>
            Entrar
          </Button>
        </Box>
        <Typography variant="body2" sx={{ mt: 3, color: "text.secondary" }}>
          Não tem conta?{" "}
          <MuiLink component={NextLink} href="/signup" onClick={(e: React.MouseEvent) => { e.preventDefault(); router.push(signupHref(new URLSearchParams(window.location.search).get("next"))); }} color="inherit">
            Criar conta
          </MuiLink>
        </Typography>
      </Box>
    </Box>
  );
}
