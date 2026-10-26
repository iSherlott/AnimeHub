import { prisma } from "@/lib/prisma";
import { logEvent, type AdminActor } from "@/lib/adminImport/pipeline";
import type { ParsedQuiz } from "@/lib/quizImport";
import { QUIZ_LENGTH } from "@/lib/quiz";
import { resolveWorkKey, type ResolvedWork } from "@/lib/workRef";

/** `work` é a chave da obra (AniList ID ou `anidb-<id>`); `anilistId` só quando ela é da AniList. */
export type ImportOutcome = { anilistId: number | null; work: string; action: "created" | "replaced"; approved: boolean };
export type ImportResult = { ok: true; outcomes: ImportOutcome[] } | { ok: false; errors: string[] };


/**
 * Grava a carga já validada. Tudo ou nada: se qualquer obra falhar (id desconhecido, quiz com tentativas),
 * nada é gravado. Recarregar um quiz sem tentativas SUBSTITUI as perguntas; com tentativas, é recusado
 * (mudar o gabarito depois de alguém responder falsearia as notas e os títulos já concedidos).
 * `approve` decide se as perguntas já entram aprovadas; por padrão ficam para revisão.
 */
export async function importQuizzes(quizzes: ParsedQuiz[], options: { approve: boolean; actor: AdminActor }): Promise<ImportResult> {
  const errors: string[] = [];
  const existing = new Map<string, { id: string; attempts: number }>();
  // A obra precisa existir no catálogo (produção ou catálogo; sem AniList ID, na plataforma): evita quiz para um id digitado errado.
  const works = new Map<string, ResolvedWork>();
  for (const q of quizzes) {
    const work = await resolveWorkKey(q.work);
    if (!work) {
      errors.push(`Obra ${q.work}: não está no catálogo. Abra a obra (ou carregue a temporada) antes de criar o quiz.`);
      continue;
    }
    works.set(q.work, work);
    const found = await prisma.quiz.findUnique({ where: work.anilistId !== null ? { anilistId: work.anilistId } : { catalogEntryId: work.catalogEntryId }, select: { id: true, _count: { select: { attempts: true } } } });
    if (found) {
      existing.set(q.work, { id: found.id, attempts: found._count.attempts });
      if (found._count.attempts > 0) errors.push(`Obra ${q.work}: o quiz já tem ${found._count.attempts} tentativa(s); as perguntas não podem ser substituídas.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const outcomes: ImportOutcome[] = [];
  await prisma.$transaction(async (tx) => {
    for (const q of quizzes) {
      const found = existing.get(q.work);
      const work = works.get(q.work) as ResolvedWork;
      const quiz = found
        ? await tx.quiz.update({ where: { id: found.id }, data: { scope: q.scope, titleReward: q.titleReward } })
        : await tx.quiz.create({ data: { anilistId: work.anilistId, catalogEntryId: work.catalogEntryId, scope: q.scope, titleReward: q.titleReward } });
      if (found) await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      await tx.quizQuestion.createMany({
        data: q.questions.map((question, i) => ({
          quizId: quiz.id,
          position: i + 1,
          category: question.category,
          text: question.text,
          optionA: question.options[0],
          optionB: question.options[1],
          optionC: question.options[2],
          optionD: question.options[3],
          correct: question.correct,
          approved: options.approve,
        })),
      });
      outcomes.push({ anilistId: work.anilistId, work: work.key, action: found ? "replaced" : "created", approved: options.approve });
    }
  });
  for (const o of outcomes) {
    await logEvent({
      source: "Quiz",
      event: o.action === "created" ? "Quiz created" : "Quiz replaced",
      message: `Quiz da obra #${o.work} ${o.action === "created" ? "criado" : "recarregado"} com ${QUIZ_LENGTH} perguntas (${o.approved ? "aprovadas" : "aguardando revisão"}).`,
      context: o.anilistId !== null ? `Obra AniList #${o.anilistId}` : `Obra ${o.work}`,
      actor: options.actor,
    });
  }
  return { ok: true, outcomes };
}

/** Como a obra do quiz aparece no registro: "AniList #154587" ou, sem AniList ID, a obra do catálogo. */
const workLabel = (quiz: { anilistId: number | null; catalogEntryId: string | null }) => (quiz.anilistId !== null ? `AniList #${quiz.anilistId}` : `do catálogo ${quiz.catalogEntryId ?? "(removida)"}`);

/** Aprova/desaprova uma pergunta (ou todas, sem `questionId`). Devolve quantas perguntas mudaram. */
export async function setApproval(quizId: string, approved: boolean, actor: AdminActor, questionId?: string): Promise<number | null> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { anilistId: true, catalogEntryId: true } });
  if (!quiz) return null;
  const { count } = await prisma.quizQuestion.updateMany({ where: { quizId, ...(questionId ? { id: questionId } : {}) }, data: { approved } });
  await logEvent({
    source: "Quiz",
    event: approved ? "Quiz approved" : "Quiz approval removed",
    message: `${questionId ? "1 pergunta" : `${count} perguntas`} do quiz da obra ${workLabel(quiz)} ${approved ? "aprovada(s)" : "voltaram para revisão"}.`,
    context: `Obra ${workLabel(quiz)}`,
    actor,
  });
  return count;
}

/** Remove o quiz — só se ninguém respondeu (senão o histórico e os títulos perdem a origem). */
export async function deleteQuiz(quizId: string, actor: AdminActor): Promise<"ok" | "not-found" | "has-attempts"> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { anilistId: true, catalogEntryId: true, _count: { select: { attempts: true, titles: true } } } });
  if (!quiz) return "not-found";
  if (quiz._count.attempts > 0 || quiz._count.titles > 0) return "has-attempts";
  await prisma.quiz.delete({ where: { id: quizId } });
  await logEvent({ source: "Quiz", event: "Quiz deleted", message: `Quiz da obra ${workLabel(quiz)} removido.`, context: `Obra ${workLabel(quiz)}`, actor });
  return "ok";
}

/** Arquivar / desarquivar (Fase 9): o quiz sai do ar sem apagar perguntas, tentativas nem títulos concedidos. */
export async function setArchived(quizId: string, archived: boolean, actor: AdminActor): Promise<boolean> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return false;
  await prisma.quiz.update({ where: { id: quizId }, data: { archivedAt: archived ? new Date() : null } });
  await prisma.adminLog.create({ data: { source: "Quiz", event: archived ? "Quiz archived" : "Quiz unarchived", message: `Quiz da obra ${workLabel(quiz)} ${archived ? "arquivado (fora do ar)" : "desarquivado"}.`, context: `quiz:${quizId}`, adminName: actor.name } });
  return true;
}

/**
 * Erros de configuração que impedem publicar (Fase 9): posições 1..10 faltando ou repetidas, texto vazio, alternativas
 * repetidas ou vazias, resposta certa fora de A–D, título de recompensa vazio.
 */
export function quizConfigErrors(quiz: { titleReward: string }, questions: Array<{ position: number; text: string; optionA: string; optionB: string; optionC: string; optionD: string; correct: number }>): string[] {
  const errors: string[] = [];
  if (!quiz.titleReward.trim()) errors.push("sem título de recompensa");
  const positions = questions.map((q) => q.position).sort((a, b) => a - b);
  const missing = Array.from({ length: QUIZ_LENGTH }, (_, i) => i + 1).filter((p) => !positions.includes(p));
  if (missing.length) errors.push(`faltam as perguntas ${missing.join(", ")}`);
  if (new Set(positions).size !== positions.length) errors.push("posição repetida");
  for (const q of questions) {
    const options = [q.optionA, q.optionB, q.optionC, q.optionD].map((o) => o.trim().toLowerCase());
    if (!q.text.trim()) errors.push(`pergunta ${q.position} sem texto`);
    if (options.some((o) => !o)) errors.push(`pergunta ${q.position} com alternativa vazia`);
    else if (new Set(options).size !== options.length) errors.push(`pergunta ${q.position} com alternativas repetidas`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) errors.push(`pergunta ${q.position} com resposta fora de A–D`);
  }
  return errors;
}
