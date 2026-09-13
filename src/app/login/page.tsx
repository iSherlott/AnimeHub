"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Alert, Link as MuiLink, TextField, Typography } from "@mui/material";
import { Header } from "@/components/Header";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink">
      <Header />
      <Box sx={{ maxWidth: 384, mx: "auto", px: 3, py: 8 }}>
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
          <MuiLink component={NextLink} href="/signup" color="inherit">
            Criar conta
          </MuiLink>
        </Typography>
      </Box>
    </div>
  );
}
