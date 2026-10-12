import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Admin → Quizzes: carga das perguntas anime a anime (JSON/CSV), validação tudo-ou-nada, revisão e aprovação.
const A = 971001;
const B = 971002;
const C = 971003;
const UNKNOWN = 971999;
const ALL = [A, B, C];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const questions = (tag: string) =>
  Array.from({ length: 10 }, (_, i) => ({ category: "personagens", text: `${tag} pergunta ${i + 1}?`, options: ["Alfa", "Beta", "Gama", "Delta"], correct: "C" }));
const payload = (anilistId: number, tag: string, extra: Record<string, unknown> = {}) => ({ anilistId, scope: "Season 1 — personagens", titleReward: `Título ${tag}`, questions: questions(tag), ...extra });

test.describe.serial("Admin — carga de perguntas do quiz", () => {
  let prisma: PrismaClient;

  async function cleanup() {
    await prisma.quiz.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanup();
    for (const id of ALL) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: id, name: `Quiz Admin Round71 ${id}` } });
      await prisma.production.create({ data: { anilistId: id, franchiseId: franchise.id, titleRomaji: `Quiz Admin Round71 ${id}`, titleNative: "薬屋のひとりごと", streamingLinksJson: "[]", fetchedAt: new Date() } });
    }
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("só administradores acessam a carga e a revisão", async ({ request, page }) => {
    expect((await request.post("/api/admin/quizzes/import", { data: { text: "{}" } })).status()).toBe(403);
    expect((await request.patch("/api/admin/quizzes/x", { data: { approved: true } })).status()).toBe(403);
    expect((await request.delete("/api/admin/quizzes/x")).status()).toBe(403);
    const denied = await page.goto("/admin/quizzes");
    expect(denied?.status()).toBe(404); // para membro a área não existe
  });

  test.describe("pelo painel", () => {
    test.use({ storageState: adminState });

    test("a página está no menu do admin e orienta o formato", async ({ page }) => {
      await page.goto("/admin");
      await page.getByRole("navigation", { name: "Administração" }).getByRole("link", { name: "Quizzes" }).click();
      await expect(page).toHaveURL(/\/admin\/quizzes$/);
      await expect(page.getByRole("heading", { level: 1, name: "Quizzes" })).toBeVisible();
      await expect(page.getByText("categoria;pergunta;A;B;C;D;correta")).toBeVisible();
    });

    test("validar mostra todos os problemas e não grava nada", async ({ page }) => {
      await page.goto("/admin/quizzes");
      const bad = payload(A, "Ruim", { questions: [{ category: "X", text: "Só uma?", options: ["a", "b"], correct: "Z" }] });
      await page.getByLabel("Perguntas (JSON ou CSV)").fill(JSON.stringify(bad));
      await page.getByTestId("quiz-import-load").click();
      const errors = page.getByTestId("quiz-import-errors");
      await expect(errors).toContainText("exatamente 10 perguntas");
      await expect(errors).toContainText("exatamente 4 alternativas");
      await expect(errors).toContainText("deve ser A, B, C ou D");
      expect(await prisma.quiz.count({ where: { anilistId: A } })).toBe(0);

      await page.getByLabel("Perguntas (JSON ou CSV)").fill(JSON.stringify(payload(A, "Bom")));
      await page.getByTestId("quiz-import-validate").click();
      await expect(page.getByTestId("quiz-import-preview")).toContainText(`Obra #${A}`);
      expect(await prisma.quiz.count({ where: { anilistId: A } })).toBe(0); // validar não grava
    });

    test("obra desconhecida é recusada (tudo ou nada: nada do envio é gravado)", async ({ request }) => {
      const res = await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify([payload(A, "Lote"), payload(UNKNOWN, "Lote")]) } });
      expect(res.status()).toBe(409);
      expect((await res.json()).errors.join(" ")).toContain(`Obra ${UNKNOWN}: não está no catálogo`);
      expect(await prisma.quiz.count({ where: { anilistId: A } })).toBe(0);
    });

    test("carregar o JSON cria o quiz em revisão: ainda indisponível para as pessoas", async ({ page, request }) => {
      await page.goto("/admin/quizzes");
      await page.getByLabel("Perguntas (JSON ou CSV)").fill(JSON.stringify(payload(A, "Primeira")));
      await page.getByTestId("quiz-import-load").click();
      await expect(page.getByTestId("quiz-import-done")).toContainText(`Obra #${A}: quiz criado (aguardando revisão)`);
      const row = page.getByTestId("admin-quiz-table").locator("tr", { hasText: `AniList #${A}` });
      await expect(row).toContainText("0/10 aprovadas");
      await expect(row).toContainText("Em revisão");
      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: A }, include: { questions: true } });
      expect(quiz.questions).toHaveLength(10);
      expect(quiz.questions.every((q) => !q.approved && q.correct === 2 && q.category === "PERSONAGENS")).toBe(true);
      // Para as pessoas: ainda indisponível.
      const state = await (await request.get(`/api/quiz/${A}`)).json();
      expect(state.quiz.available).toBe(false);
    });

    test("a revisão mostra o gabarito só aqui; aprovar uma a uma e aprovar todas libera o quiz", async ({ page, request }) => {
      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: A }, include: { questions: { orderBy: { position: "asc" } } } });
      await page.goto(`/admin/quizzes/${quiz.id}`);
      const table = page.getByTestId("admin-question-table");
      await expect(table).toContainText("Primeira pergunta 1?");
      await expect(table.locator('li[data-correct="true"]').first()).toContainText("C · Gama ✓"); // gabarito visível ao admin

      await page.getByTestId(`question-toggle-${quiz.questions[0].id}`).click();
      await expect(table.locator("tr", { hasText: "Primeira pergunta 1?" })).toContainText("Aprovada");
      expect((await (await request.get(`/api/quiz/${A}`)).json()).quiz.available).toBe(false); // 1/10 ainda não basta

      await page.getByTestId("quiz-approve-all").click();
      await expect(page.getByTestId("quiz-unapprove-all")).toBeVisible();
      const state = await (await request.get(`/api/quiz/${A}`)).json();
      expect(state.quiz).toMatchObject({ available: true, titleReward: "Título Primeira" });
      expect(JSON.stringify(state)).not.toContain("Gama"); // nem gabarito nem perguntas vazam
      await expect(page.getByTestId("quiz-approve-all")).toHaveCount(0);

      await page.goto("/admin/quizzes");
      await expect(page.getByTestId("admin-quiz-table").locator("tr", { hasText: `AniList #${A}` })).toContainText("Disponível");
    });

    test("recarregar um quiz sem tentativas substitui as perguntas (e volta para revisão)", async ({ page }) => {
      await page.goto("/admin/quizzes");
      await page.getByLabel("Perguntas (JSON ou CSV)").fill(JSON.stringify(payload(A, "Segunda")));
      await page.getByTestId("quiz-import-load").click();
      await expect(page.getByTestId("quiz-import-done")).toContainText("perguntas substituídas (aguardando revisão)");
      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: A }, include: { questions: true } });
      expect(quiz.titleReward).toBe("Título Segunda");
      expect(quiz.questions).toHaveLength(10);
      expect(quiz.questions.every((q) => !q.approved && q.text.startsWith("Segunda"))).toBe(true);
    });

    test("CSV de um anime, já aprovado, com escopo e título do formulário", async ({ page }) => {
      await page.goto("/admin/quizzes");
      await page.getByLabel("AniList id (CSV)").fill(String(B));
      await page.getByLabel("Escopo (CSV)").fill("Season 2 — ambientação");
      await page.getByLabel("Título da recompensa (CSV)").fill("Guardião do palácio");
      const csv = Array.from({ length: 10 }, (_, i) => `Ambientação;Pergunta CSV ${i + 1}?;Alfa;Beta;Gama;Delta;D`).join("\n");
      await page.getByLabel("Perguntas (JSON ou CSV)").fill(csv);
      await page.getByTestId("quiz-import-approve").check();
      await page.getByTestId("quiz-import-load").click();
      await expect(page.getByTestId("quiz-import-done")).toContainText(`Obra #${B}: quiz criado (aprovadas)`);
      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: B }, include: { questions: true } });
      expect(quiz).toMatchObject({ scope: "Season 2 — ambientação", titleReward: "Guardião do palácio" });
      expect(quiz.questions.every((q) => q.approved && q.correct === 3)).toBe(true);
      await expect(page.getByTestId("admin-quiz-table").locator("tr", { hasText: `AniList #${B}` })).toContainText("Disponível");
    });

    test("quiz com tentativas não pode ser substituído nem removido; sem tentativas pode ser removido", async ({ page, request }) => {
      const quizB = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: B } });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
      await prisma.quizAttempt.create({ data: { quizId: quizB.id, userId: user.id, status: "COMPLETED", answers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0 } });

      const replace = await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify(payload(B, "Tarde")) } });
      expect(replace.status()).toBe(409);
      expect((await replace.json()).errors.join(" ")).toContain("já tem 1 tentativa");
      expect((await request.delete(`/api/admin/quizzes/${quizB.id}`)).status()).toBe(409);
      await page.goto(`/admin/quizzes/${quizB.id}`);
      await expect(page.getByTestId("quiz-delete")).toBeDisabled();

      // Um quiz sem tentativas é removido pela interface, com confirmação.
      await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify(payload(C, "Remover")) } });
      const quizC = await prisma.quiz.findUniqueOrThrow({ where: { anilistId: C } });
      await page.goto(`/admin/quizzes/${quizC.id}`);
      await page.getByTestId("quiz-delete").click();
      await page.getByTestId("quiz-delete-confirm").click();
      await expect(page).toHaveURL(/\/admin\/quizzes$/);
      expect(await prisma.quiz.count({ where: { anilistId: C } })).toBe(0);
    });

    test("as cargas e aprovações ficam nos logs do admin", async ({ page }) => {
      await page.goto("/admin/logs");
      const table = page.getByTestId("admin-logs-table");
      await expect(table).toContainText("Quiz created");
      await expect(table).toContainText("Quiz approved");
    });
  });
});
