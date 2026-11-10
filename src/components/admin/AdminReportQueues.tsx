"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { STICKY_NAME_CELL_SX } from "@/components/admin/adminTableSx";

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

/** Admin → Acesso e moderação: as filas de denúncia de comentários e de publicações (moderador e admin). */
export function AdminReportQueues() {
  const [commentReports, setCommentReports] = useState<AdminCommentReport[]>([]);
  const [postReports, setPostReports] = useState<AdminPostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvingPostId, setResolvingPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    try {
      const [reportsRes, postReportsRes] = await Promise.all([fetch("/api/admin/comment-reports"), fetch("/api/admin/post-reports")]);
      const reportsData = await reportsRes.json();
      const postReportsData = await postReportsRes.json();
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
    // Mesmo caso canônico de "buscar dados num efeito" dos docs do React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReports();
  }, []);

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
    </Box>
  );
}
