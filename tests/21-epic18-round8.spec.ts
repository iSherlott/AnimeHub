import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

test.describe("Epic 18 — 8ª rodada de auditoria de UX/UI — contador de caracteres do comentário", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("digitar no campo de comentário mostra e atualiza o contador N/2000", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    const input = page.getByPlaceholder("Escreva um comentário...");
    await expect(page.getByText("0/2000")).toBeVisible();

    const draft = "Testando o contador";
    await input.fill(draft);
    await expect(page.getByText(`${draft.length}/2000`)).toBeVisible();
  });

  test("o campo trava em 2000 caracteres, sem deixar digitar além disso", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    const input = page.getByPlaceholder("Escreva um comentário...");
    // colar (fill) um texto bem maior que o limite, igual ao padrão já
    // usado pelo compositor do Feed pra travar no limite do servidor
    // (MAX_BODY_LENGTH) em vez de só avisar depois de tentar publicar.
    await input.fill("a".repeat(2500));

    await expect(page.getByText("2000/2000")).toBeVisible();
    expect((await input.inputValue()).length).toBe(2000);
  });
});
