import { OPTION_COUNT, QUIZ_LENGTH } from "@/lib/quiz";
import { CATALOG_ONLY_SLUG } from "@/lib/workHref";

/**
 * Carga de perguntas do quiz, anime a anime (Admin → Quizzes). Aceita JSON (um quiz ou uma lista) ou
 * CSV/TSV com `;` para um único anime. Tudo é validado antes de gravar — nada entra pela metade.
 *
 * JSON:  { "anilistId": 154587, "scope": "Season 1 — …", "titleReward": "Olhar de boticária",
 *          "questions": [ { "category": "PERSONAGENS", "text": "…?", "options": ["A","B","C","D"], "correct": "A" } ] }
 * CSV:   categoria;pergunta;alternativa A;alternativa B;alternativa C;alternativa D;correta(A–D)
 *
 * Obra sem AniList ID (só do AniDB/Kitsu): no lugar de "anilistId", "anidbId": 18290 (ou "kitsuId") ou
 * "work": "anidb-18290". No CSV, o campo "ID da obra" do formulário aceita o número da AniList ou "anidb-<id>".
 */
export const LIMITS = { category: 30, text: 300, option: 120, scope: 120, title: 60 } as const;

export type ParsedQuestion = { category: string; text: string; options: [string, string, string, string]; correct: number };
/** `work` é a chave da obra (o AniList ID ou `anidb-<id>`/`kitsu-<id>`); `anilistId` só quando a chave é da AniList. */
export type ParsedQuiz = { anilistId: number | null; work: string; scope: string; titleReward: string; questions: ParsedQuestion[] };
export type QuizDefaults = { anilistId?: number | null; work?: string | null; scope?: string | null; titleReward?: string | null };

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A chave da obra do quiz: `work`, `anidbId`, `kitsuId` ou `anilistId` (nessa ordem), ou o padrão do formulário. */
function workKeyOf(raw: { work?: unknown; anidbId?: unknown; kitsuId?: unknown; anilistId?: unknown }, defaults: QuizDefaults): string | null {
  const text = typeof raw.work === "string" ? raw.work.trim() : "";
  if (text) return CATALOG_ONLY_SLUG.test(text) || positive(text) ? text : null;
  if (raw.anidbId !== undefined) return positive(raw.anidbId) ? `anidb-${positive(raw.anidbId)}` : null;
  if (raw.kitsuId !== undefined) return positive(raw.kitsuId) ? `kitsu-${positive(raw.kitsuId)}` : null;
  if (raw.anilistId !== undefined) return positive(raw.anilistId) ? String(positive(raw.anilistId)) : null;
  const fallback = defaults.work?.trim() || (defaults.anilistId ? String(defaults.anilistId) : "");
  return fallback && (CATALOG_ONLY_SLUG.test(fallback) || positive(fallback)) ? fallback : null;
}
export type ParseResult = { ok: true; quizzes: ParsedQuiz[] } | { ok: false; errors: string[] };

const LETTERS = ["A", "B", "C", "D"];

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "A".."D" (qualquer caixa) → 0..3; qualquer outra coisa é inválida. */
export function letterToIndex(value: unknown): number | null {
  const i = LETTERS.indexOf(clean(value).toUpperCase());
  return i >= 0 ? i : null;
}

export function validateQuestion(raw: { category?: unknown; text?: unknown; options?: unknown; correct?: unknown }, label: string, errors: string[]): ParsedQuestion | null {
  const before = errors.length;
  const category = clean(raw.category).toUpperCase();
  const text = clean(raw.text);
  if (!category) errors.push(`${label}: falta a categoria (ex.: PERSONAGENS).`);
  else if (category.length > LIMITS.category) errors.push(`${label}: categoria passa de ${LIMITS.category} caracteres.`);
  if (!text) errors.push(`${label}: falta o enunciado.`);
  else if (text.length > LIMITS.text) errors.push(`${label}: enunciado passa de ${LIMITS.text} caracteres.`);

  const options = Array.isArray(raw.options) ? raw.options.map(clean) : [];
  if (options.length !== OPTION_COUNT) {
    errors.push(`${label}: são necessárias exatamente ${OPTION_COUNT} alternativas (A–D), vieram ${options.length}.`);
  } else {
    options.forEach((o, i) => {
      if (!o) errors.push(`${label}: a alternativa ${LETTERS[i]} está vazia.`);
      else if (o.length > LIMITS.option) errors.push(`${label}: a alternativa ${LETTERS[i]} passa de ${LIMITS.option} caracteres.`);
    });
    const filled = options.filter(Boolean).map((o) => o.toLowerCase());
    if (new Set(filled).size !== filled.length) errors.push(`${label}: há alternativas repetidas.`);
  }
  const correct = letterToIndex(raw.correct);
  if (correct === null) errors.push(`${label}: a alternativa correta deve ser A, B, C ou D.`);

  if (errors.length > before || correct === null) return null;
  return { category, text, options: options as ParsedQuestion["options"], correct };
}

function validateQuiz(raw: { anilistId?: unknown; work?: unknown; anidbId?: unknown; kitsuId?: unknown; scope?: unknown; titleReward?: unknown; questions?: unknown }, defaults: QuizDefaults, errors: string[]): ParsedQuiz | null {
  const before = errors.length;
  const work = workKeyOf(raw, defaults);
  const label = work ? `Obra ${work}` : "Quiz";
  if (!work) errors.push('Quiz: falta o id da AniList (número positivo) ou da obra no catálogo ("anidbId", ou "work": "anidb-<id>").');
  const scope = clean(raw.scope ?? defaults.scope);
  const titleReward = clean(raw.titleReward ?? defaults.titleReward);
  if (!scope) errors.push(`${label}: falta o escopo (ex.: "Season 1 — personagens e ambientação").`);
  else if (scope.length > LIMITS.scope) errors.push(`${label}: escopo passa de ${LIMITS.scope} caracteres.`);
  if (!titleReward) errors.push(`${label}: falta o título da recompensa (ex.: "Olhar de boticária").`);
  else if (titleReward.length > LIMITS.title) errors.push(`${label}: título da recompensa passa de ${LIMITS.title} caracteres.`);

  const list = Array.isArray(raw.questions) ? raw.questions : [];
  if (list.length !== QUIZ_LENGTH) errors.push(`${label}: são necessárias exatamente ${QUIZ_LENGTH} perguntas, vieram ${list.length}.`);
  const questions: ParsedQuestion[] = [];
  list.forEach((q, i) => {
    const parsed = validateQuestion((q && typeof q === "object" ? q : {}) as Record<string, unknown>, `${label} · pergunta ${i + 1}`, errors);
    if (parsed) questions.push(parsed);
  });
  const texts = questions.map((q) => q.text.toLowerCase());
  if (new Set(texts).size !== texts.length) errors.push(`${label}: há perguntas com enunciado repetido.`);

  if (errors.length > before) return null;
  return { anilistId: positive(work) ? Number(work) : null, work: work as string, scope, titleReward, questions };
}

/** CSV/TSV com `;` (ou tab): uma linha por pergunta, sem cabeçalho obrigatório (a linha que começa com "categoria" é ignorada). */
function parseDelimited(text: string, defaults: QuizDefaults, errors: string[]): ParsedQuiz[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (rows.length && /^categoria\s*[;\t]/i.test(rows[0])) rows.shift();
  const questions = rows.map((line) => {
    const cells = line.split(/;|\t/).map((c) => c.trim());
    return { category: cells[0], text: cells[1], options: cells.slice(2, 6), correct: cells[6] };
  });
  const quiz = validateQuiz({ questions }, defaults, errors);
  return quiz ? [quiz] : [];
}

export function parseQuizImport(text: string, defaults: QuizDefaults = {}): ParseResult {
  const body = text.trim();
  if (!body) return { ok: false, errors: ["Cole o JSON ou o CSV das perguntas para carregar."] };
  if (body.length > 1_000_000) return { ok: false, errors: ["O conteúdo passa de 1 MB."] };
  const errors: string[] = [];
  let quizzes: ParsedQuiz[] = [];

  if (body.startsWith("{") || body.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch (error) {
      return { ok: false, errors: [`JSON inválido: ${error instanceof Error ? error.message : "erro de leitura"}.`] };
    }
    const list = Array.isArray(data) ? data : [data];
    if (list.length === 0) return { ok: false, errors: ["A lista de quizzes está vazia."] };
    for (const item of list) {
      const quiz = validateQuiz((item && typeof item === "object" ? item : {}) as Record<string, unknown>, defaults, errors);
      if (quiz) quizzes.push(quiz);
    }
  } else {
    quizzes = parseDelimited(body, defaults, errors);
  }

  const ids = quizzes.map((q) => q.work);
  if (new Set(ids).size !== ids.length) errors.push("Há duas cargas para a mesma obra no mesmo envio.");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, quizzes };
}
