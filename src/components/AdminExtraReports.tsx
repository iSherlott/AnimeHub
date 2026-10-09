"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { REPORT_REASON_LABELS, isReportReason } from "@/lib/reportReasons";

type CommentReport = {
  commentId: string;
  postId: string;
  body: string;
  isSpoiler: boolean;
  commentDeleted: boolean;
  author: { displayName: string; email: string };
  reportCount: number;
  reasons: string[];
};

type ProfileReport = {
  userId: string;
  displayName: string;
  email: string;
  bio: string | null;
  reportCount: number;
  reasons: string[];
};

function reasonSummary(reasons: string[]): string {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()]
    .map(([r, n]) => `${isReportReason(r) ? REPORT_REASON_LABELS[r] : r}${n > 1 ? ` ×${n}` : ""}`)
    .join(" · ");
}

/**
 * Filas de revisão mínima do Admin (Figma `13:41133`): denúncias de
 * RESPOSTAS e de PERFIS. Na v1 só há decisão "manter/remover" para respostas
 * e "marcar como revisada" para perfis (suspensão: D-16 pendente).
 */
export function AdminExtraReports() {
  const [comments, setComments] = useState<CommentReport[]>([]);
  const [profiles, setProfiles] = useState<ProfileReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/admin/post-comment-reports"), fetch("/api/admin/user-reports")])
      .then(async ([a, b]) => {
        const [ca, pb] = await Promise.all([a.json(), b.json()]);
        if (cancelled) return;
        setComments(ca.reports ?? []);
        setProfiles(pb.reports ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Falha ao carregar as filas de denúncia de respostas e perfis");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resolveComment(commentId: string, action: "keep" | "remove") {
    setError(null);
    const res = await fetch(`/api/admin/post-comment-reports/${commentId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      setError("Falha ao resolver denúncia de resposta");
      return;
    }
    setComments((prev) => prev.filter((r) => r.commentId !== commentId));
  }

  async function resolveProfile(userId: string) {
    setError(null);
    const res = await fetch(`/api/admin/user-reports/${userId}/resolve`, { method: "POST" });
    if (!res.ok) {
      setError("Falha ao resolver denúncia de perfil");
      return;
    }
    setProfiles((prev) => prev.filter((r) => r.userId !== userId));
  }

  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}

      <Box component="section">
        <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
          Denúncias de resposta
        </Typography>
        {comments.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma denúncia de resposta pendente.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Denúncias de resposta pendentes">
              <TableHead>
                <TableRow>
                  <TableCell>Resposta</TableCell>
                  <TableCell>Autor</TableCell>
                  <TableCell>Motivos</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comments.map((r) => (
                  <TableRow key={r.commentId}>
                    <TableCell sx={{ maxWidth: 320 }}>
                      {r.isSpoiler ? "(marcada como spoiler) " : ""}
                      {r.body}
                    </TableCell>
                    <TableCell>{r.author.displayName}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {r.reportCount} · {reasonSummary(r.reasons)}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" color="inherit" onClick={() => resolveComment(r.commentId, "keep")}>
                        Manter
                      </Button>
                      <Button size="small" color="error" onClick={() => resolveComment(r.commentId, "remove")}>
                        Remover
                      </Button>
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
          Denúncias de perfil
        </Typography>
        {profiles.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma denúncia de perfil pendente.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Denúncias de perfil pendentes">
              <TableHead>
                <TableRow>
                  <TableCell>Perfil</TableCell>
                  <TableCell>Motivos</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profiles.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      {r.displayName}
                      {r.bio ? <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>{r.bio}</Typography> : null}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {r.reportCount} · {reasonSummary(r.reasons)}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" color="inherit" onClick={() => resolveProfile(r.userId)}>
                        Marcar como revisada
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </>
  );
}
