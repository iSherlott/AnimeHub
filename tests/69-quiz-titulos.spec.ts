import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Quiz por obra (10 perguntas, sem gabarito, só 10/10 dá título) + Minhas conquistas + título equipado no perfil e nas postagens.
const PERFECT = 969001; // 10 perguntas aprovadas, a pessoa acompanha
const UNAVAILABLE = 969002; // só 9 aprovadas
const NOT_FOLLOWING = 969003; // completo, mas a pessoa não acompanha
const PARTIAL = 969004; // para o resultado 7/10
const ABANDON = 969005; // para sair do quiz
const ALL = [PERFECT, UNAVAILABLE, NOT_FOLLOWING, PARTIAL, ABANDON];

/** Gabarito do teste: a pergunta N tem a resposta certa na alternativa N % 4 (A..D = 0..3). */
const correctFor = (position: number) => position % 4;
const LETTER = ["A", "B", "C", "D"];

test.describe.serial("Quiz, títulos e conquistas", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function makeQuiz(anilistId: number, titleReward: string, approved: number) {
    const quiz = await prisma.quiz.create({ data: { anilistId, scope: "Season 1 — personagens e ambientação", titleReward } });
    await prisma.quizQuestion.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        quizId: quiz.id,
        position: i + 1,
        category: "PERSONAGENS",
        text: `Pergunta ${i + 1} do quiz ${anilistId}?`,
        optionA: "Alternativa A",
        optionB: "Alternativa B",
        optionC: "Alternativa C",
        optionD: "Alternativa D",
        correct: correctFor(i + 1),
        approved: i < approved,
      })),
    });
    return quiz;
  }

  async function cleanup() {
    await prisma.user.update({ where: { email: TEST_USER_EMAIL }, data: { equippedTitleId: null } });
    await prisma.quiz.deleteMany({ where: { anilistId: { in: ALL } } }); // cascata: perguntas, tentativas e títulos
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await cleanup();
    for (const id of ALL) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: id, name: `Quiz Round69 ${id}` } });
      await prisma.production.create({
        data: { anilistId: id, franchiseId: franchise.id, titleRomaji: `Quiz Round69 ${id}`, titleNative: "薬屋のひとりごと", titleEnglish: "Quiz Anime", streamingLinksJson: "[]", fetchedAt: new Date() },
      });
    }
    await makeQuiz(PERFECT, "Olhar de boticária", 10);
    await makeQuiz(UNAVAILABLE, "Titulo Indisponivel", 9);
    await makeQuiz(NOT_FOLLOWING, "Titulo Sem Acompanhar", 10);
    await makeQuiz(PARTIAL, "Titulo Parcial", 10);
    await makeQuiz(ABANDON, "Titulo Abandono", 10);
    for (const id of [PERFECT, UNAVAILABLE, PARTIAL, ABANDON]) {
      await prisma.anime.create({ data: { userId, anilistId: id, titleRomaji: `Quiz Round69 ${id}`, genres: "" } });
    }
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function answerAll(page: import("@playwright/test").Page, pick: (position: number) => number) {
    for (let position = 1; position <= 10; position += 1) {
      await expect(page.getByTestId("quiz-question")).toContainText(`Pergunta ${position} do quiz`);
      await page.getByTestId(`quiz-option-${LETTER[pick(position)]}`).click();
      await page.getByTestId("quiz-confirm").click();
    }
  }

  test("a página da obra tem o atalho do quiz; a introdução avisa dos spoilers e não mostra perguntas", async ({ page }) => {
    await page.goto(`/obra/${PERFECT}`);
    await expect(page.getByTestId("quiz-entry")).toContainText("10 perguntas");
    await page.getByTestId("quiz-link").click();
    await expect(page).toHaveURL(new RegExp(`/obra/${PERFECT}/quiz$`));
    await expect(page.getByTestId("quiz-spoiler-notice")).toContainText("Este quiz contém spoilers");
    await expect(page.getByTestId("quiz-intro")).not.toContainText("Pergunta 1 do quiz");
    await expect(page.getByTestId("quiz-progress")).toContainText("10 perguntas · não iniciado");
    await expect(page.getByTestId("title-badge")).toContainText("Olhar de boticária");
  });

  test("quiz com menos de 10 perguntas aprovadas fica indisponível", async ({ page }) => {
    await page.goto(`/obra/${UNAVAILABLE}/quiz`);
    await expect(page.getByTestId("quiz-unavailable")).toContainText("Experiência real · Indisponível");
    await expect(page.getByRole("button", { name: "Iniciar · indisponível" })).toBeDisabled();
    expect((await page.request.post(`/api/quiz/${UNAVAILABLE}/attempt`)).status()).toBe(409);
  });

  test("exige acompanhar a obra", async ({ page }) => {
    await page.goto(`/obra/${NOT_FOLLOWING}/quiz`);
    await expect(page.getByTestId("quiz-not-following")).toContainText("Acompanhe a obra para fazer o quiz");
    expect((await page.request.post(`/api/quiz/${NOT_FOLLOWING}/attempt`)).status()).toBe(403);
  });

  test.describe("sem conta", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    // Sistema fechado (28/10): o quiz é da comunidade, só de quem tem conta.
    test("visitante vai ao login, que o devolve ao quiz; a API pede sessão", async ({ page, request }) => {
      await page.goto(`/obra/${PERFECT}/quiz`);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/obra/${PERFECT}/quiz`)}`);
      expect((await request.post(`/api/quiz/${PERFECT}/attempt`)).status()).toBe(401);
      expect((await request.get("/api/users/me/titles")).status()).toBe(401);
      expect((await request.get(`/api/quiz/${PERFECT}`)).status()).toBe(401);
    });
  });

  test("a API nunca entrega o gabarito e valida a ordem e a escolha", async ({ request }) => {
    const state = await (await request.get(`/api/quiz/${PERFECT}`)).json();
    expect(state.quiz).toMatchObject({ available: true, titleReward: "Olhar de boticária" });
    expect(JSON.stringify(state)).not.toContain("correct");
    // Sem tentativa iniciada, a pergunta não sai.
    expect((await request.get(`/api/quiz/${PERFECT}/attempt`)).status()).toBe(409);

    expect((await request.post(`/api/quiz/${PERFECT}/attempt`)).status()).toBe(201);
    const q = await (await request.get(`/api/quiz/${PERFECT}/attempt`)).json();
    expect(q.question).toMatchObject({ position: 1, total: 10, category: "PERSONAGENS" });
    expect(JSON.stringify(q)).not.toContain("correct");
    expect(JSON.stringify(q)).not.toContain("approved");

    const answer = (position: unknown, choice: unknown) => request.post(`/api/quiz/${PERFECT}/answer`, { data: { position, choice } });
    expect((await answer(1, 7)).status()).toBe(400); // alternativa inexistente
    expect((await answer(3, 0)).status()).toBe(400); // fora de ordem
    const ok = await (await answer(1, 1)).json();
    expect(ok).toEqual({ finished: false, answered: 1 }); // não diz se acertou
    const again = await (await answer(1, 2)).json();
    expect(again).toEqual({ finished: false, answered: 1 }); // reenvio não conta duas vezes
    const attempt = await prisma.quizAttempt.findFirstOrThrow({ where: { userId, quiz: { anilistId: PERFECT } } });
    expect(attempt.answers).toEqual([1]);

    // Abandona para o próximo teste partir do zero.
    expect((await request.delete(`/api/quiz/${PERFECT}/attempt`)).status()).toBe(200);
  });

  test("tentativa completa com 10/10: título desbloqueado, equipável, e a coleção persiste", async ({ page }) => {
    await page.goto(`/obra/${PERFECT}/quiz`);
    await page.getByTestId("quiz-start").click();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 1 de 10");
    // Confirmar fica desabilitado até escolher uma alternativa.
    await expect(page.getByTestId("quiz-confirm")).toBeDisabled();
    await answerAll(page, correctFor);

    await expect(page.getByTestId("quiz-score")).toHaveText("10/10");
    await expect(page.getByTestId("quiz-result")).toContainText("Você acertou as 10 perguntas.");
    await expect(page.getByTestId("quiz-result")).toContainText("Título desbloqueado");
    const owned = await prisma.userTitle.findFirstOrThrow({ where: { userId, quiz: { anilistId: PERFECT } } });
    expect(owned).toBeTruthy();
    // Uma tentativa concluída por quiz: recomeçar é recusado.
    expect((await page.request.post(`/api/quiz/${PERFECT}/attempt`)).status()).toBe(409);

    await page.getByTestId("quiz-equip").click();
    await expect(page.getByTestId("quiz-equip")).toContainText("✓ Equipado");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).equippedTitleId).toBe(owned.id);

    // Recarregar mostra o resultado de novo (sem refazer o quiz).
    await page.reload();
    await expect(page.getByTestId("quiz-score")).toHaveText("10/10");
  });

  test("Minhas conquistas: lista o título equipado, remove do perfil sem apagar e equipa de novo", async ({ page }) => {
    await page.goto("/conquistas");
    const card = page.locator('[data-testid^="achievement-"][data-equipped]').first();
    await expect(card).toContainText("✓ EQUIPADO");
    await expect(card).toContainText("Olhar de boticária");
    await expect(page.getByTestId("profile-now").getByTestId("title-badge")).toContainText("Olhar de boticária");

    await card.getByTestId("achievement-remove").click();
    await expect(card).toContainText("DESBLOQUEADO");
    await expect(page.getByTestId("profile-now").getByTestId("title-badge")).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).equippedTitleId).toBeNull();
    expect(await prisma.userTitle.count({ where: { userId } })).toBe(1); // a coleção não mudou

    await page.getByTestId("choose-title").click();
    await page.getByRole("radio", { name: /Olhar de boticária/ }).click();
    await page.getByTestId("title-confirm").click();
    await expect(card).toContainText("✓ EQUIPADO");
  });

  test("o título equipado aparece sob o nome no perfil, nas postagens e nas respostas", async ({ page, request }) => {
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("title-badge").first()).toContainText("称号");
    await expect(page.getByTestId("tab-achievements")).toContainText("Minhas conquistas · 1");

    const res = await request.post("/api/posts", { data: { body: "Postagem com título equipado Round69" } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    expect(post.author.title).toBe("Olhar de boticária");
    const feed = await (await request.get(`/api/posts?tab=recent&limit=5`)).json();
    expect(feed.posts.find((p: { id: string }) => p.id === post.id).author.title).toBe("Olhar de boticária");

    const comment = await request.post(`/api/posts/${post.id}/comments`, { data: { body: "Resposta" } });
    expect((await comment.json()).comment.author.title).toBe("Olhar de boticária");
    await request.delete(`/api/posts/${post.id}`);
  });

  test("com 7/10 nada é concedido e nova tentativa não está habilitada", async ({ page }) => {
    await page.goto(`/obra/${PARTIAL}/quiz`);
    await page.getByTestId("quiz-start").click();
    // Acerta as 7 primeiras e erra as 3 últimas.
    await answerAll(page, (position) => (position <= 7 ? correctFor(position) : (correctFor(position) + 1) % 4));

    await expect(page.getByTestId("quiz-score")).toHaveText("7/10");
    await expect(page.getByTestId("quiz-result")).toContainText("Você acertou 7 de 10.");
    await expect(page.getByTestId("quiz-result")).toContainText("nenhuma recompensa parcial foi concedida");
    await expect(page.getByTestId("quiz-retry-disabled")).toBeDisabled();
    expect(await prisma.userTitle.count({ where: { userId, quiz: { anilistId: PARTIAL } } })).toBe(0);
    expect((await page.request.post(`/api/quiz/${PARTIAL}/attempt`)).status()).toBe(409);
  });

  test("sair do quiz pede confirmação, não concede nada e permite recomeçar do início", async ({ page }) => {
    await page.goto(`/obra/${ABANDON}/quiz`);
    await page.getByTestId("quiz-start").click();
    await page.getByTestId("quiz-option-A").click();
    await page.getByTestId("quiz-confirm").click();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 2 de 10");

    await page.getByTestId("quiz-leave").click();
    const dialog = page.getByRole("dialog", { name: "Sair do quiz?" });
    await expect(dialog).toContainText("Abandonar não concede recompensa");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 2 de 10"); // continuou

    await page.getByTestId("quiz-leave").click();
    await page.getByTestId("quiz-leave-confirm").click();
    await expect(page.getByTestId("quiz-intro")).toBeVisible();
    expect(await prisma.userTitle.count({ where: { userId, quiz: { anilistId: ABANDON } } })).toBe(0);

    await page.getByTestId("quiz-start").click();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 1 de 10");
  });

  test("recarregar no meio da tentativa retoma de onde parou", async ({ page }) => {
    await page.goto(`/obra/${ABANDON}/quiz`); // a tentativa nova (pergunta 1) está em andamento
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 1 de 10");
    await page.getByTestId("quiz-option-C").click();
    await page.getByTestId("quiz-confirm").click();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 2 de 10");
    await page.reload();
    await expect(page.getByTestId("quiz-progress")).toContainText("Pergunta 2 de 10");
  });
});
