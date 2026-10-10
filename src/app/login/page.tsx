"use client";

import { readNextFromLocation, signupHref } from "@/lib/safeRedirect";
import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import { Box, Button, Alert, Link as MuiLink, Typography } from "@mui/material";
import { AuthField, AuthShell } from "@/components/AuthShell";
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
    <AuthShell title="Entrar no ANIME HUB" subtitle="Sua lista e seus próximos lançamentos, em um só lugar.">
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <AuthField label="E-mail" type="email" required autoComplete="email" value={email} onChange={setEmail} endIcon={<MailOutlinedIcon />} />
        <AuthField label="Senha" type="password" required autoComplete="current-password" value={password} onChange={setPassword} />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box>
          <Button type="submit" variant="contained" loading={loading} startIcon={<ArrowForwardIcon />} sx={{ textTransform: "uppercase" }}>
            Entrar
          </Button>
        </Box>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Após entrar, você volta ao anime que queria acompanhar. O vínculo só é criado quando você confirmar + Acompanhar.
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Não tem conta?{" "}
          <MuiLink component={NextLink} href="/signup" onClick={(e: React.MouseEvent) => { e.preventDefault(); router.push(signupHref(new URLSearchParams(window.location.search).get("next"))); }} color="inherit">
            Criar conta
          </MuiLink>
        </Typography>
      </Box>
    </AuthShell>
  );
}
