"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

type AdminInvite = {
  id: string;
  code: string;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  usedBy: { email: string; displayName: string } | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
      ]);
      const usersData = await usersRes.json();
      const invitesData = await invitesRes.json();
      setUsers(usersData.users ?? []);
      setInvites(invitesData.invites ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invites", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao gerar convite");
        return;
      }
      await loadAll();
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleResetPassword(userId: string) {
    setError(null);
    setResetResult(null);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Falha ao resetar senha");
      return;
    }
    setResetResult({ userId, password: data.temporaryPassword });
  }

  if (loading) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Carregando...
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box component="section">
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
          <Typography variant="h6" component="h2" className="font-display" sx={{ textTransform: "uppercase" }}>
            Convites
          </Typography>
          <Button onClick={handleCreateInvite} disabled={creatingInvite} variant="contained" size="small">
            {creatingInvite ? "Gerando..." : "+ Gerar convite"}
          </Button>
        </Box>
        {invites.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhum convite gerado ainda.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Convites gerados">
              <TableHead>
                <TableRow>
                  <TableCell>Código</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Detalhes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invites.map((invite) => {
                  const expired = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
                  const status = invite.usedBy ? "usado" : expired ? "expirado" : "disponível";
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <Box component="code">{invite.code}</Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={status}
                          size="small"
                          color={status === "disponível" ? "success" : status === "usado" ? "default" : "error"}
                          sx={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>
                        {invite.usedBy
                          ? `por ${invite.usedBy.displayName} (${invite.usedBy.email})`
                          : invite.expiresAt
                            ? `expira em ${fmtDate(invite.expiresAt)}`
                            : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box component="section">
        <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
          Usuários
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Usuários cadastrados">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Desde</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {u.displayName}
                      </Typography>
                      {u.role === "ADMIN" && (
                        <Chip label="admin" size="small" sx={{ bgcolor: "secondary.main", color: "#0b0b0d", fontWeight: 700, fontSize: 10 }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{u.email}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{fmtDate(u.createdAt)}</TableCell>
                  <TableCell align="right">
                    <Button onClick={() => handleResetPassword(u.id)} size="small" color="inherit">
                      Resetar senha
                    </Button>
                    {resetResult?.userId === u.id && (
                      <Alert severity="warning" sx={{ mt: 1, textAlign: "left" }}>
                        Nova senha temporária (mostrada só uma vez, repasse por
                        fora): <Box component="code" sx={{ fontWeight: 700 }}>{resetResult.password}</Box>
                      </Alert>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
