"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ConfirmDialog } from "@/components/StatePanels";

async function call(url: string, method: "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "Não foi possível concluir a ação.";
  } catch {
    return "Não foi possível falar com o servidor.";
  }
}

/** Aprovar/revisar perguntas e remover o quiz (só sem tentativas). Cada ação recarrega a página com o novo estado. */
export function QuizReviewActions({ quizId, allApproved, removable }: { quizId: string; allApproved: boolean; removable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function run(fn: () => Promise<string | null>, after?: () => void) {
    setBusy(true);
    setError(null);
    const problem = await fn();
    setBusy(false);
    if (problem) setError(problem);
    else (after ?? (() => router.refresh()))();
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {allApproved ? (
          <Button onClick={() => void run(() => call(`/api/admin/quizzes/${quizId}`, "PATCH", { approved: false }))} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="quiz-unapprove-all">
            Voltar tudo para revisão
          </Button>
        ) : (
          <Button variant="contained" onClick={() => void run(() => call(`/api/admin/quizzes/${quizId}`, "PATCH", { approved: true }))} disabled={busy} data-testid="quiz-approve-all">
            Aprovar as 10 perguntas
          </Button>
        )}
        <Button onClick={() => setConfirm(true)} disabled={busy || !removable} sx={ELEVATED_BUTTON_SX} data-testid="quiz-delete">
          Remover quiz
        </Button>
      </Box>
      {!removable && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Este quiz já tem tentativas ou títulos concedidos e não pode ser removido.</Typography>}
      {error && (
        <Typography role="alert" sx={{ fontSize: 14, color: "primary.main" }}>
          {error}
        </Typography>
      )}
      <ConfirmDialog
        open={confirm}
        title="Remover este quiz?"
        effect="O quiz e as perguntas deixam de existir. Como ninguém respondeu, nenhum título ou histórico é afetado."
        confirmLabel="Remover quiz"
        busyLabel="Removendo…"
        busy={busy}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void run(() => call(`/api/admin/quizzes/${quizId}`, "DELETE"), () => router.push("/admin/quizzes"))}
        confirmTestId="quiz-delete-confirm"
      />
    </Box>
  );
}

/** Aprova ou devolve uma pergunta à revisão. */
export function QuestionApprovalToggle({ quizId, questionId, approved }: { quizId: string; questionId: string; approved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await call(`/api/admin/quizzes/${quizId}`, "PATCH", { approved: !approved, questionId });
        setBusy(false);
        router.refresh();
      }}
      sx={ELEVATED_BUTTON_SX}
      data-testid={`question-toggle-${questionId}`}
    >
      {approved ? "Desaprovar" : "Aprovar"}
    </Button>
  );
}
