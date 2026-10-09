"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { AdminExtraReports } from "@/components/AdminExtraReports";
import { AdminDataPanel } from "@/components/AdminDataPanel";

/** A tabela de Usuários rola na horizontal no mobile pra caber Desde/Ações
 * — sem fixar a 1ª coluna, rolar até "Resetar senha" (ação que derruba
 * sessões da pessoa) tira "Nome" de vista por completo, deixando quem
 * administra sem saber em qual usuário está prestes a clicar (achado real
 * da 7ª rodada de auditoria, Epic 18). `bgcolor` opaco é necessário pra não
 * deixar o resto da linha "vazar" por baixo da coluna fixa ao rolar. */
const STICKY_NAME_CELL_SX = {
  position: "sticky",
  left: 0,
  bgcolor: "background.paper",
  zIndex: 1,
} as const;

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

type AdminCommentReport = {
  commentId: string;
  anilistId: number;
  animeTitle: string;
  body: string;
  commentCreatedAt: string;
  commentDeleted: boolean;
  author: { displayName: string; email: string };
  reportCount: number;
  reporters: { displayName: string; email: string }[];
};

type AdminPostReport = {
  postId: string;
  animeTitleRomaji: string;
  body: string;
  postCreatedAt: string;
  postDeleted: boolean;
  author: { displayName: string; email: string };
  reportCount: number;
  reporters: { displayName: string; email: string }[];
  /** Quantos reposts/citações ativos referenciam este post — contexto que
   * faltava antes de "Remover" (achado real da 23ª rodada de auditoria,
   * Epic 18): removê-lo derruba o embed/a faixa desses posts em outro
   * lugar do feed. */
  repostCount: number;
  quoteCount: number;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [commentReports, setCommentReports] = useState<AdminCommentReport[]>([]);
  const [postReports, setPostReports] = useState<AdminPostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvingPostId, setResolvingPostId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // Guarda síncrona pra clique duplo/triplo rápido em "+ Gerar convite" —
  // o `disabled={creatingInvite}` do botão só reflete depois do próximo
  // render, e um clique real (não sintético) pode disparar de novo antes
  // disso, gerando convites duplicados (achado real da 5ª rodada de
  // auditoria, Epic 18).
  const creatingInviteRef = useRef(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, invitesRes, reportsRes, postReportsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
        fetch("/api/admin/comment-reports"),
        fetch("/api/admin/post-reports"),
      ]);
      const usersData = await usersRes.json();
      const invitesData = await invitesRes.json();
      const reportsData = await reportsRes.json();
      const postReportsData = await postReportsRes.json();
      setUsers(usersData.users ?? []);
      setInvites(invitesData.invites ?? []);
      setCommentReports(reportsData.reports ?? []);
      setPostReports(postReportsData.reports ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveReport(commentId: string, action: "keep" | "remove") {
    setResolvingId(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comment-reports/${commentId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao resolver denúncia");
        return;
      }
      setCommentReports((prev) => prev.filter((r) => r.commentId !== commentId));
    } finally {
      setResolvingId(null);
    }
  }

  async function handleResolvePostReport(postId: string, action: "keep" | "remove") {
    setResolvingPostId(postId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/post-reports/${postId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao resolver denúncia");
        return;
      }
      setPostReports((prev) => prev.filter((r) => r.postId !== postId));
    } finally {
      setResolvingPostId(null);
    }
  }

  useEffect(() => {
    // loadAll também é reusada pelo botão de gerar convite (linha 117) pra
    // recarregar a lista depois — precisa poder setar loading=true sozinha.
    // Mesmo caso canônico de "buscar dados num efeito" dos docs do React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function handleCreateInvite() {
    if (creatingInviteRef.current) return;
    creatingInviteRef.current = true;
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
      creatingInviteRef.current = false;
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
        <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
          Denúncias de comentário
        </Typography>
        {commentReports.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma denúncia pendente.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Denúncias de comentário pendentes">
              <TableHead>
                <TableRow>
                  {/* Mesma correção da tabela de Usuários (achado real da
                      7ª rodada) — nunca aplicada aqui nem na de posts
                      abaixo, apesar de terem o mesmo padrão de ação
                      destrutiva ("Remover") só alcançável rolando pro
                      lado no mobile (achado real da 23ª rodada de
                      auditoria, Epic 18). */}
                  <TableCell sx={STICKY_NAME_CELL_SX}>Anime</TableCell>
                  <TableCell>Autor</TableCell>
                  <TableCell>Comentário</TableCell>
                  <TableCell align="right">Denúncias</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {commentReports.map((r) => (
                  <TableRow key={r.commentId}>
                    <TableCell sx={{ ...STICKY_NAME_CELL_SX, color: "text.secondary" }}>{r.animeTitle}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{r.author.displayName}</TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      {r.commentDeleted ? (
                        <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
                          (já apagado pelo autor)
                        </Typography>
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {r.body}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={r.reportCount} size="small" color="error" />
                    </TableCell>
                    <TableCell align="right">
                      {r.commentDeleted ? (
                        <Button
                          onClick={() => handleResolveReport(r.commentId, "keep")}
                          disabled={resolvingId === r.commentId}
                          size="small"
                          color="inherit"
                        >
                          Marcar resolvido
                        </Button>
                      ) : (
                        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                          <Button
                            onClick={() => handleResolveReport(r.commentId, "keep")}
                            disabled={resolvingId === r.commentId}
                            size="small"
                            color="inherit"
                          >
                            Manter
                          </Button>
                          <Button
                            onClick={() => handleResolveReport(r.commentId, "remove")}
                            disabled={resolvingId === r.commentId}
                            size="small"
                            color="error"
                          >
                            Remover
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box component="section">
        <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
          Denúncias de post
        </Typography>
        {postReports.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma denúncia pendente.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Denúncias de post pendentes">
              <TableHead>
                <TableRow>
                  <TableCell sx={STICKY_NAME_CELL_SX}>Anime</TableCell>
                  <TableCell>Autor</TableCell>
                  <TableCell>Post</TableCell>
                  <TableCell align="right">Denúncias</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {postReports.map((r) => (
                  <TableRow key={r.postId}>
                    <TableCell sx={{ ...STICKY_NAME_CELL_SX, color: "text.secondary" }}>{r.animeTitleRomaji}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{r.author.displayName}</TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      {r.postDeleted ? (
                        <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
                          (já apagado pelo autor)
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {r.body}
                          </Typography>
                          {/* Contexto que faltava antes de decidir
                              "Remover" (soft-delete) — sem isso, o admin
                              não tinha como saber que ia derrubar
                              silenciosamente o embed de citação/a faixa
                              de repost pra quem vê esse post embutido em
                              outro lugar do feed (achado real da 23ª
                              rodada de auditoria, Epic 18). Só faz
                              sentido aqui, não no ramo "já apagado" acima
                              — lá "Remover" nem aparece mais. */}
                          {(r.repostCount > 0 || r.quoteCount > 0) && (
                            <Typography variant="caption" sx={{ display: "block", color: "warning.main", mt: 0.5 }}>
                              ⚠ Remover afeta outros posts: {r.repostCount > 0 && `${r.repostCount} repost${r.repostCount === 1 ? "" : "s"}`}
                              {r.repostCount > 0 && r.quoteCount > 0 && ", "}
                              {r.quoteCount > 0 && `${r.quoteCount} citaç${r.quoteCount === 1 ? "ão" : "ões"}`}
                            </Typography>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={r.reportCount} size="small" color="error" />
                    </TableCell>
                    <TableCell align="right">
                      {r.postDeleted ? (
                        <Button
                          onClick={() => handleResolvePostReport(r.postId, "keep")}
                          disabled={resolvingPostId === r.postId}
                          size="small"
                          color="inherit"
                        >
                          Marcar resolvido
                        </Button>
                      ) : (
                        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                          <Button
                            onClick={() => handleResolvePostReport(r.postId, "keep")}
                            disabled={resolvingPostId === r.postId}
                            size="small"
                            color="inherit"
                          >
                            Manter
                          </Button>
                          <Button
                            onClick={() => handleResolvePostReport(r.postId, "remove")}
                            disabled={resolvingPostId === r.postId}
                            size="small"
                            color="error"
                          >
                            Remover
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <AdminExtraReports />

      <AdminDataPanel />

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
                <TableCell sx={STICKY_NAME_CELL_SX}>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Desde</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell sx={STICKY_NAME_CELL_SX}>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Diálogo em vez de revelar inline na tabela — o Alert inline
          (mt: 1 dentro da célula) visualmente sobrepunha a linha de baixo
          em vez de empurrá-la (achado real da 3ª rodada de auditoria,
          Epic 18); um Dialog nunca colide com o conteúdo ao redor. */}
      <Dialog open={resetResult !== null} onClose={() => setResetResult(null)}>
        <DialogTitle>Nova senha temporária</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Mostrada só uma vez — repasse pra pessoa por fora deste painel:
          </DialogContentText>
          <Box component="code" sx={{ display: "block", mt: 2, fontWeight: 700, fontSize: 16 }}>
            {resetResult?.password}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetResult(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
