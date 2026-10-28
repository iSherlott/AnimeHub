import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Fase 9: papéis com menor privilégio — curador (catálogo), moderador (denúncias), administrador (tudo, inclusive
// papéis) —, a recusa auditada, a troca de papel com as travas, o menu por papel, e o quiz arquivado sai do ar.
const CURATOR_TOKEN = "c0a7000000000000000000000000000000000000000000000000000000110";
const MODERATOR_TOKEN = "m0d0000000000000000000000000000000000000000000000000000000110";
const QUIZ_WORK = 110001;

const stateFor = (token: string) => ({
  cookies: [{ name: SESSION_COOKIE_NAME, value: token, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
});

test.describe.serial("Papéis e quizzes", () => {
  let prisma: PrismaClient;
  let curatorId: string;
  let moderatorId: string;
  let quizId: string;

  async function clean() {
    const users = await prisma.user.findMany({ where: { email: { in: ["curador-110@test.local", "moderador-110@test.local"] } }, select: { id: true } });
    await prisma.adminLog.deleteMany({ where: { context: { in: users.map((u) => `user:${u.id}`) } } });
    await prisma.changeLog.deleteMany({ where: { entity: "User", entityId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.quiz.deleteMany({ where: { anilistId: QUIZ_WORK } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: QUIZ_WORK } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
    curatorId = (await prisma.user.create({ data: { ...base, email: "curador-110@test.local", displayName: "Curador 110", role: "CURATOR" } })).id;
    moderatorId = (await prisma.user.create({ data: { ...base, email: "moderador-110@test.local", displayName: "Moderador 110", role: "MODERATOR" } })).id;
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    await prisma.session.create({ data: { token: CURATOR_TOKEN, userId: curatorId, expiresAt } });
    await prisma.session.create({ data: { token: MODERATOR_TOKEN, userId: moderatorId, expiresAt } });
    await prisma.catalogEntry.create({ data: { anilistId: QUIZ_WORK, titleRomaji: "Quiz Round110", source: "anilist", onPlatform: true } });
    quizId = (
      await prisma.quiz.create({
        data: {
          anilistId: QUIZ_WORK,
          scope: "Season 1",
          titleReward: "Título 110",
          questions: { create: Array.from({ length: 10 }, (_, i) => ({ position: i + 1, category: "geral", text: `Pergunta ${i + 1}?`, optionA: "A", optionB: "B", optionC: "C", optionD: "D", correct: 0, approved: true })) },
        },
      })
    ).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  async function status(request: APIRequestContext, method: "get" | "post" | "patch", url: string, data?: unknown) {
    return (await request[method](url, data ? { data } : undefined)).status();
  }

  test.describe("curador", () => {
    test.use({ storageState: stateFor(CURATOR_TOKEN) });

    test("abre o catálogo, mas não usuários, criação de contas nem moderação; a recusa fica no log", async ({ request, page }) => {
      expect(await status(request, "get", "/api/admin/works")).toBe(200);
      expect(await status(request, "get", "/api/admin/genres")).toBe(200);
      expect(await status(request, "get", "/api/admin/users")).toBe(403);
      expect(await status(request, "post", "/api/admin/users", { email: "curador-cria@test.local", displayName: "Não" })).toBe(403);
      expect(await status(request, "get", "/api/admin/comment-reports")).toBe(403);
      expect(await prisma.adminLog.count({ where: { event: "Access denied", context: `user:${curatorId}` } })).toBeGreaterThanOrEqual(3);

      await page.goto("/admin/obras");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Catálogo de obras");
      const nav = page.getByRole("navigation", { name: "Administração" });
      await expect(nav.getByRole("link", { name: "Taxonomia" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Acesso e moderação" })).toHaveCount(0);
      expect((await page.goto("/admin/acesso"))?.status()).toBe(404);
    });
  });

  test.describe("moderador", () => {
    test.use({ storageState: stateFor(MODERATOR_TOKEN) });

    test("abre a moderação, mas não o catálogo nem os usuários", async ({ request, page }) => {
      expect(await status(request, "get", "/api/admin/comment-reports")).toBe(200);
      expect(await status(request, "get", "/api/admin/works")).toBe(403);
      expect(await status(request, "get", "/api/admin/users")).toBe(403);

      await page.goto("/admin/acesso");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Acesso e moderação");
      await expect(page.getByRole("heading", { name: "Usuários" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Convites" })).toHaveCount(0);
      const nav = page.getByRole("navigation", { name: "Administração" });
      await expect(nav.getByRole("link", { name: "Catálogo de obras" })).toHaveCount(0);
      expect((await page.goto("/admin/obras"))?.status()).toBe(404);
    });
  });

  test.describe("administrador", () => {
    test.use({ storageState: stateFor(TEST_ADMIN_SESSION_TOKEN) });

    test("muda papéis com as travas: papel inválido, o próprio papel e o último administrador", async ({ request, page }) => {
      const admin = await prisma.user.findFirstOrThrow({ where: { sessions: { some: { token: TEST_ADMIN_SESSION_TOKEN } } } });
      expect(await status(request, "patch", `/api/admin/users/${moderatorId}`, { role: "DONO" })).toBe(400);
      expect(await status(request, "patch", `/api/admin/users/${admin.id}`, { role: "MEMBER" })).toBe(409);
      expect(await status(request, "patch", `/api/admin/users/${moderatorId}`, { role: "CURATOR" })).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: moderatorId } })).role).toBe("CURATOR");
      expect(await prisma.changeLog.count({ where: { entity: "User", entityId: moderatorId, field: "role" } })).toBe(1);

      await page.goto("/admin/acesso");
      const select = page.getByTestId(`user-role-${curatorId}`);
      await select.selectOption("MODERATOR");
      await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: curatorId } })).role).toBe("MODERATOR");
      await expect(page.getByTestId(`user-role-${admin.id}`)).toBeDisabled();
    });

    test("arquivar o quiz tira do ar sem apagar; desarquivar volta", async ({ request, page }) => {
      const available = async () => (await (await request.get(`/api/quiz/${QUIZ_WORK}`)).json()).quiz?.available;
      expect(await available()).toBe(true);
      await page.goto(`/admin/quizzes/${quizId}`);
      await page.getByTestId("quiz-archive").click();
      await expect.poll(async () => (await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).archivedAt).not.toBeNull();
      await page.goto("/admin/quizzes");
      await expect(page.getByTestId(`quiz-state-${quizId}`)).toContainText("Arquivado");
      expect(await prisma.quizQuestion.count({ where: { quizId } })).toBe(10);
      expect(await available()).toBe(false);
      expect(await status(request, "patch", `/api/admin/quizzes/${quizId}`, { archived: false })).toBe(200);
      await page.reload();
      await expect(page.getByTestId(`quiz-state-${quizId}`)).toContainText("Publicado");
      expect(await available()).toBe(true);
    });
  });
});
