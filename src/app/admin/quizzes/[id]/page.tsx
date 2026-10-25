import { notFound } from "next/navigation";
import NextLink from "next/link";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { QuestionApprovalToggle, QuizReviewActions } from "@/components/admin/QuizReviewActions";
import { requireAdminPage } from "@/lib/adminPage";
import { QUIZ_LENGTH } from "@/lib/quiz";

export const dynamic = "force-dynamic";

const LETTERS = ["A", "B", "C", "D"];

/** Admin → Quizzes → revisar: as 10 perguntas com o gabarito (só aqui), aprovação individual ou de uma vez. */
export default async function AdminQuizReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("catalog");
  const quiz = await prisma.quiz.findUnique({
    where: { id: (await params).id },
    include: { questions: { orderBy: { position: "asc" } }, _count: { select: { attempts: true, titles: true } } },
  });
  if (!quiz) notFound();
  const work = await prisma.production.findUnique({ where: { anilistId: quiz.anilistId }, select: { titleRomaji: true, titleNative: true } }).then(
    (p) => p ?? prisma.catalogEntry.findUnique({ where: { anilistId: quiz.anilistId }, select: { titleRomaji: true, titleNative: true } })
  );
  const approved = quiz.questions.filter((q) => q.approved).length;
  const available = approved === QUIZ_LENGTH && quiz.questions.length === QUIZ_LENGTH;

  return (
    <>
      <AdminPageHeader
        title={`Quiz · ${work?.titleNative ?? work?.titleRomaji ?? `Obra #${quiz.anilistId}`}`}
        subtitle={`${quiz.scope} · título "${quiz.titleReward}" · AniList #${quiz.anilistId}`}
        action={available ? <SmallChip tone="success">Disponível para as pessoas</SmallChip> : <SmallChip tone="warning">{approved}/{QUIZ_LENGTH} aprovadas · indisponível</SmallChip>}
      />
      <NextLink href="/admin/quizzes" style={{ color: "inherit", fontSize: 14 }}>
        ← Quizzes
      </NextLink>

      <AdminPanel title="Aprovação">
        <Typography sx={{ fontSize: 14 }}>
          O quiz só abre para as pessoas com as {QUIZ_LENGTH} perguntas aprovadas. {quiz._count.attempts} tentativa(s) · {quiz._count.titles} título(s) concedido(s).
        </Typography>
        <QuizReviewActions quizId={quiz.id} allApproved={available} removable={quiz._count.attempts === 0 && quiz._count.titles === 0} archived={Boolean(quiz.archivedAt)} />
      </AdminPanel>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 20 }}>
          Perguntas e gabarito
        </Typography>
        <AdminTable
          caption="Perguntas do quiz"
          testId="admin-question-table"
          rows={quiz.questions}
          rowKey={(q) => q.id}
          columns={[
            { key: "n", label: "#", render: (q) => q.position, width: "48px" },
            {
              key: "q",
              label: "Pergunta",
              render: (q) => (
                <>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{q.category}</div>
                  <div>{q.text}</div>
                </>
              ),
            },
            {
              key: "o",
              label: "Alternativas (correta em destaque)",
              render: (q) => (
                <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
                  {[q.optionA, q.optionB, q.optionC, q.optionD].map((option, i) => (
                    <li key={LETTERS[i]} data-correct={i === q.correct ? "true" : undefined} style={{ fontWeight: i === q.correct ? 700 : 400, color: i === q.correct ? "#22c55e" : undefined }}>
                      {LETTERS[i]} · {option}
                      {i === q.correct ? " ✓" : ""}
                    </li>
                  ))}
                </Box>
              ),
            },
            { key: "s", label: "Estado", render: (q) => (q.approved ? <SmallChip tone="success">Aprovada</SmallChip> : <SmallChip tone="warning">Em revisão</SmallChip>) },
            { key: "a", label: "Ação", render: (q) => <QuestionApprovalToggle quizId={quiz.id} questionId={q.id} approved={q.approved} /> },
          ]}
        />
      </Box>
    </>
  );
}
