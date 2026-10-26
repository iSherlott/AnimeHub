import NextLink from "next/link";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { QuizImportForm } from "@/components/admin/QuizImportForm";
import { Notice } from "@/components/StatePanels";
import { requireAdminPage } from "@/lib/adminPage";
import { QUIZ_LENGTH } from "@/lib/quiz";
import { quizConfigErrors } from "@/lib/quizAdmin";

export const dynamic = "force-dynamic";

/** Admin → Quizzes: carga das perguntas anime a anime, revisão/aprovação e o estado de cada quiz. */
export default async function AdminQuizzesPage() {
  await requireAdminPage("catalog");
  const quizzes = await prisma.quiz.findMany({
    orderBy: { updatedAt: "desc" },
    include: { questions: { select: { approved: true, position: true, text: true, optionA: true, optionB: true, optionC: true, optionD: true, correct: true } }, _count: { select: { attempts: true, titles: true } }, catalogEntry: { select: { titleRomaji: true, titleNative: true, anidbId: true, kitsuId: true } } },
  });
  // Resultados (Fase 9): concluídas e nota média, por quiz — só agregados, sem dados de quem respondeu.
  const results = quizzes.length ? await prisma.quizAttempt.groupBy({ by: ["quizId"], where: { quizId: { in: quizzes.map((q) => q.id) }, status: "COMPLETED" }, _count: { _all: true }, _avg: { score: true } }) : [];
  const resultBy = new Map(results.map((r) => [r.quizId, { completed: r._count._all, avg: r._avg.score }]));
  const ids = quizzes.flatMap((q) => (q.anilistId !== null ? [q.anilistId] : []));
  const [productions, catalog] = ids.length
    ? await Promise.all([
        prisma.production.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleNative: true } }),
        prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleNative: true } }),
      ])
    : [[], []];
  const names = new Map<number, string>();
  for (const w of [...catalog, ...productions]) if (w.anilistId !== null) names.set(w.anilistId, w.titleNative ?? w.titleRomaji);

  const rows = quizzes.map((q) => {
    const approved = q.questions.filter((x) => x.approved).length;
    // Quiz de obra sem AniList ID: o nome e a origem vêm da obra do catálogo.
    const name = q.anilistId !== null ? (names.get(q.anilistId) ?? `Obra #${q.anilistId}`) : (q.catalogEntry ? (q.catalogEntry.titleNative ?? q.catalogEntry.titleRomaji) : "Obra fora do catálogo");
    const source = q.anilistId !== null ? `AniList #${q.anilistId}` : q.catalogEntry?.anidbId ? `AniDB #${q.catalogEntry.anidbId}` : q.catalogEntry?.kitsuId ? `Kitsu #${q.catalogEntry.kitsuId}` : "—";
    return { quiz: q, approved, total: q.questions.length, name, source, errors: quizConfigErrors(q, q.questions), result: resultBy.get(q.id) ?? null };
  });

  return (
    <>
      <AdminPageHeader title="Quizzes" subtitle="Carregue as 10 perguntas de cada anime, revise e aprove. O quiz só fica disponível para as pessoas com as 10 aprovadas." />

      <AdminPanel title="Carregar perguntas">
        <QuizImportForm />
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          JSON: um objeto <code>{`{ anilistId, scope, titleReward, questions: [{ category, text, options: [A,B,C,D], correct: "A" }] }`}</code> ou uma lista deles
          (vários animes de uma vez). CSV de um anime, uma pergunta por linha:{" "}
          <code>categoria;pergunta;A;B;C;D;correta</code>. Sempre {QUIZ_LENGTH} perguntas, 4 alternativas distintas e a correta de A a D. Recarregar um quiz
          sem tentativas substitui as perguntas. Obra sem AniList ID (só do AniDB): use <code>anidbId</code> (ou <code>{`"work": "anidb-<id>"`}</code>) no lugar de{" "}
          <code>anilistId</code>; no CSV, informe <code>anidb-&lt;id&gt;</code> no ID da obra.
        </Typography>
      </AdminPanel>

      <Notice tone="info" title="Revisão editorial">
        As perguntas entram aguardando revisão. O gabarito só aparece aqui no admin; nunca é enviado a quem faz o quiz.
      </Notice>

      {rows.length === 0 ? (
        <Typography data-testid="quiz-list-empty" sx={{ fontSize: 14, color: "text.secondary" }}>
          Nenhum quiz carregado ainda.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Quizzes carregados
          </Typography>
          <AdminTable
            caption="Quizzes carregados"
            testId="admin-quiz-table"
            rows={rows}
            rowKey={(r) => r.quiz.id}
            columns={[
              { key: "work", label: "Obra", render: (r) => (<><div lang="ja">{r.name}</div><div>{r.source}</div></>) },
              { key: "scope", label: "Escopo / Título", render: (r) => (<><div>{r.quiz.scope}</div><div>称号 · {r.quiz.titleReward}</div></>) },
              { key: "q", label: "Perguntas", render: (r) => `${r.approved}/${QUIZ_LENGTH} aprovadas` },
              {
                key: "state",
                label: "Estado",
                render: (r) => (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }} data-testid={`quiz-state-${r.quiz.id}`}>
                    {r.quiz.archivedAt ? (
                      <SmallChip>Arquivado</SmallChip>
                    ) : r.approved === QUIZ_LENGTH && r.total === QUIZ_LENGTH && r.errors.length === 0 ? (
                      <SmallChip tone="success">Publicado</SmallChip>
                    ) : (
                      <SmallChip tone="warning">Rascunho</SmallChip>
                    )}
                    {r.errors.length > 0 && <Typography sx={{ fontSize: 12, color: "warning.main" }}>{r.errors.slice(0, 3).join(" · ")}</Typography>}
                  </Box>
                ),
              },
              {
                key: "att",
                label: "Tentativas · concluídas · nota média · títulos",
                render: (r) => `${r.quiz._count.attempts} · ${r.result?.completed ?? 0} · ${r.result?.avg != null ? r.result.avg.toFixed(1) : "—"} · ${r.quiz._count.titles}`,
              },
              {
                key: "act",
                label: "Ação",
                render: (r) => (
                  <NextLink href={`/admin/quizzes/${r.quiz.id}`} style={{ color: "inherit" }}>
                    Revisar
                  </NextLink>
                ),
              },
            ]}
          />
        </Box>
      )}
    </>
  );
}
