import { prisma } from "@/lib/prisma";

/**
 * Quiz por obra (Figma "20 — Quiz"): 10 perguntas, 4 alternativas, uma por vez, confirmar antes de
 * avançar, sem voltar e **sem mostrar gabarito**. Só 10/10 desbloqueia o título cosmético; não há XP,
 * nível, ranking nem recompensa parcial. Nova tentativa é uma política pendente: uma tentativa
 * concluída por pessoa e quiz (a em andamento pode ser abandonada).
 */
export const QUIZ_LENGTH = 10;
export const OPTION_COUNT = 4;

export type QuizErrorCode = "NOT_FOUND" | "UNAVAILABLE" | "NOT_FOLLOWING" | "ALREADY_COMPLETED" | "NO_ATTEMPT" | "BAD_ANSWER";

export class QuizError extends Error {
  constructor(
    readonly code: QuizErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Acertos: compara as escolhas confirmadas com o gabarito (que nunca sai do servidor). */
export function scoreAnswers(correct: number[], answers: number[]): number {
  return answers.reduce((total, choice, index) => total + (choice === correct[index] ? 1 : 0), 0);
}

/** Uma escolha válida é um inteiro 0..3 (A..D). */
export function isValidChoice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < OPTION_COUNT;
}

export type QuizPublic = { scope: string; titleReward: string; available: boolean };

export type QuizState = {
  quiz: QuizPublic | null;
  /** A pessoa tem a obra em Acompanhando (condição de acesso). */
  following: boolean;
  attempt: { status: "NONE" | "IN_PROGRESS" | "COMPLETED"; answered: number; score: number | null };
  /** O título já é da pessoa (e se está equipado). */
  title: { id: string; name: string; equipped: boolean } | null;
};

async function approvedQuestions(quizId: string) {
  return prisma.quizQuestion.findMany({
    where: { quizId, approved: true, position: { gte: 1, lte: QUIZ_LENGTH } },
    orderBy: { position: "asc" },
  });
}

/** Exatamente as posições 1..10 aprovadas (sem buraco nem repetição). */
export function isComplete(positions: number[]): boolean {
  return positions.length === QUIZ_LENGTH && positions.every((p, i) => p === i + 1);
}

export async function getQuizState(anilistId: number, userId: string | null): Promise<QuizState> {
  const quiz = await prisma.quiz.findUnique({ where: { anilistId } });
  const [following, attempt, owned, user] = await Promise.all([
    userId ? prisma.anime.findUnique({ where: { userId_anilistId: { userId, anilistId } }, select: { id: true } }).then(Boolean) : Promise.resolve(false),
    userId && quiz
      ? prisma.quizAttempt.findFirst({ where: { userId, quizId: quiz.id, status: { in: ["IN_PROGRESS", "COMPLETED"] } }, orderBy: { startedAt: "desc" } })
      : Promise.resolve(null),
    userId && quiz ? prisma.userTitle.findUnique({ where: { userId_quizId: { userId, quizId: quiz.id } } }) : Promise.resolve(null),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { equippedTitleId: true } }) : Promise.resolve(null),
  ]);

  let available = false;
  // Arquivado (Fase 9) sai do ar: quem já ganhou o título continua com ele.
  if (quiz && !quiz.archivedAt) available = isComplete((await approvedQuestions(quiz.id)).map((q) => q.position));

  return {
    quiz: quiz ? { scope: quiz.scope, titleReward: quiz.titleReward, available } : null,
    following,
    attempt: attempt
      ? { status: attempt.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS", answered: attempt.answers.length, score: attempt.score }
      : { status: "NONE", answered: 0, score: null },
    title: owned && quiz ? { id: owned.id, name: quiz.titleReward, equipped: user?.equippedTitleId === owned.id } : null,
  };
}

async function requireAccess(anilistId: number, userId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { anilistId } });
  if (!quiz) throw new QuizError("NOT_FOUND", "Esta obra ainda não tem quiz.");
  if (quiz.archivedAt) throw new QuizError("UNAVAILABLE", "Este quiz foi arquivado.");
  const questions = await approvedQuestions(quiz.id);
  if (!isComplete(questions.map((q) => q.position))) throw new QuizError("UNAVAILABLE", "Este quiz ainda não tem 10 perguntas aprovadas.");
  const following = await prisma.anime.findUnique({ where: { userId_anilistId: { userId, anilistId } }, select: { id: true } });
  if (!following) throw new QuizError("NOT_FOLLOWING", "Acompanhe a obra para fazer o quiz.");
  return { quiz, questions };
}

/** Inicia (ou retoma) a tentativa. Iniciar é o consentimento de spoiler: só aqui as perguntas passam a ser liberadas. */
export async function startAttempt(anilistId: number, userId: string): Promise<{ attemptId: string; answered: number }> {
  const { quiz } = await requireAccess(anilistId, userId);
  const completed = await prisma.quizAttempt.findFirst({ where: { userId, quizId: quiz.id, status: "COMPLETED" } });
  if (completed) throw new QuizError("ALREADY_COMPLETED", "Você já concluiu este quiz. Nova tentativa ainda não está habilitada.");
  const open = await prisma.quizAttempt.findFirst({ where: { userId, quizId: quiz.id, status: "IN_PROGRESS" } });
  if (open) return { attemptId: open.id, answered: open.answers.length };
  const created = await prisma.quizAttempt.create({ data: { userId, quizId: quiz.id } });
  return { attemptId: created.id, answered: 0 };
}

export type QuestionDTO = { position: number; total: number; category: string; text: string; options: [string, string, string, string] };

/** Pergunta atual da tentativa em andamento — sem o gabarito. */
export async function currentQuestion(anilistId: number, userId: string): Promise<QuestionDTO> {
  const { quiz, questions } = await requireAccess(anilistId, userId);
  const attempt = await prisma.quizAttempt.findFirst({ where: { userId, quizId: quiz.id, status: "IN_PROGRESS" } });
  if (!attempt) throw new QuizError("NO_ATTEMPT", "Inicie o quiz para ver as perguntas.");
  const q = questions[attempt.answers.length];
  if (!q) throw new QuizError("NO_ATTEMPT", "Tentativa já respondida por inteiro.");
  return { position: q.position, total: QUIZ_LENGTH, category: q.category, text: q.text, options: [q.optionA, q.optionB, q.optionC, q.optionD] };
}

export type AnswerResult = { finished: false; answered: number } | { finished: true; score: number; perfect: boolean; title: { id: string; name: string } | null };

/**
 * Registra a resposta confirmada da pergunta `position`. Reenviar uma resposta já registrada
 * não conta duas vezes; sem gabarito na resposta. Na 10ª resposta fecha a tentativa e, com 10/10,
 * concede o título (uma vez).
 */
export async function submitAnswer(anilistId: number, userId: string, position: number, choice: unknown): Promise<AnswerResult> {
  if (!isValidChoice(choice) || !Number.isInteger(position)) throw new QuizError("BAD_ANSWER", "Escolha uma alternativa de A a D.");
  const { quiz, questions } = await requireAccess(anilistId, userId);
  const attempt = await prisma.quizAttempt.findFirst({ where: { userId, quizId: quiz.id, status: "IN_PROGRESS" } });
  if (!attempt) throw new QuizError("NO_ATTEMPT", "Inicie o quiz para responder.");

  const answered = attempt.answers.length;
  // Resposta já registrada para esta posição (reenvio): não conta de novo.
  if (position <= answered) return { finished: false, answered };
  if (position !== answered + 1) throw new QuizError("BAD_ANSWER", "Responda as perguntas na ordem.");

  const answers = [...attempt.answers, choice];
  if (answers.length < QUIZ_LENGTH) {
    await prisma.quizAttempt.update({ where: { id: attempt.id }, data: { answers } });
    return { finished: false, answered: answers.length };
  }

  const score = scoreAnswers(questions.map((q) => q.correct), answers);
  const perfect = score === QUIZ_LENGTH;
  let title: { id: string; name: string } | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.quizAttempt.update({ where: { id: attempt.id }, data: { answers, score, status: "COMPLETED", finishedAt: new Date() } });
    if (perfect) {
      const owned = await tx.userTitle.upsert({ where: { userId_quizId: { userId, quizId: quiz.id } }, create: { userId, quizId: quiz.id }, update: {} });
      title = { id: owned.id, name: quiz.titleReward };
    }
  });
  return { finished: true, score, perfect, title };
}

/** Abandona a tentativa em andamento: sem recompensa e sem registro de nota; a coleção e o título atual não mudam. */
export async function abandonAttempt(anilistId: number, userId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({ where: { anilistId } });
  if (!quiz) return;
  await prisma.quizAttempt.updateMany({ where: { userId, quizId: quiz.id, status: "IN_PROGRESS" }, data: { status: "ABANDONED", finishedAt: new Date() } });
}

export type TitleDTO = {
  id: string;
  name: string;
  anilistId: number;
  scope: string;
  equipped: boolean;
  awardedAt: string;
  work: { titleRomaji: string; titleEnglish: string | null; titleNative: string | null; coverImage: string | null };
};

/** Coleção de títulos da pessoa (Minhas conquistas), com a obra de cada um. */
export async function listTitles(userId: string): Promise<TitleDTO[]> {
  const [titles, user] = await Promise.all([
    prisma.userTitle.findMany({ where: { userId }, include: { quiz: true }, orderBy: { awardedAt: "desc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { equippedTitleId: true } }),
  ]);
  const ids = titles.map((t) => t.quiz.anilistId);
  const [productions, catalog] = ids.length
    ? await Promise.all([
        prisma.production.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
        prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
      ])
    : [[], []];
  const work = new Map<number, TitleDTO["work"]>();
  for (const w of [...catalog, ...productions]) if (w.anilistId !== null) work.set(w.anilistId, { titleRomaji: w.titleRomaji, titleEnglish: w.titleEnglish, titleNative: w.titleNative, coverImage: w.coverImage });
  return titles.map((t) => ({
    id: t.id,
    name: t.quiz.titleReward,
    anilistId: t.quiz.anilistId,
    scope: t.quiz.scope,
    equipped: user?.equippedTitleId === t.id,
    awardedAt: t.awardedAt.toISOString(),
    work: work.get(t.quiz.anilistId) ?? { titleRomaji: `Obra #${t.quiz.anilistId}`, titleEnglish: null, titleNative: null, coverImage: null },
  }));
}

/** Equipa um título que a pessoa possui (ou nenhum, com `null`). Equipar não altera a coleção. */
export async function equipTitle(userId: string, titleId: string | null): Promise<boolean> {
  if (titleId !== null) {
    const owned = await prisma.userTitle.findFirst({ where: { id: titleId, userId }, select: { id: true } });
    if (!owned) return false;
  }
  await prisma.user.update({ where: { id: userId }, data: { equippedTitleId: titleId } });
  return true;
}

/** Nome do título equipado de cada usuário (ids → "Olhar de boticária"); quem não tem título equipado fica de fora. */
export async function equippedTitleNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique }, equippedTitleId: { not: null } }, select: { id: true, equippedTitleId: true } });
  if (users.length === 0) return new Map();
  const titles = await prisma.userTitle.findMany({ where: { id: { in: users.map((u) => u.equippedTitleId as string) } }, include: { quiz: { select: { titleReward: true } } } });
  const byTitle = new Map(titles.map((t) => [t.id, t]));
  const result = new Map<string, string>();
  for (const u of users) {
    const title = byTitle.get(u.equippedTitleId as string);
    // O título só vale se ainda for da própria pessoa.
    if (title && title.userId === u.id) result.set(u.id, title.quiz.titleReward);
  }
  return result;
}
