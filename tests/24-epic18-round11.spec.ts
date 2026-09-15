import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const TITLE_ANILIST_ID = 901100;

test.describe("Epic 18 — 11ª rodada de auditoria de UX/UI — título em PT rejeita texto invisível/longo demais", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: TITLE_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: TITLE_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Titulo Em PT",
        titlePortuguese: null,
        genres: "",
      },
      update: { titlePortuguese: null },
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  // .trim() sozinho aceitava um título só de zero-width space como
  // "não vazio", e esse valor vencia o fallback pro romaji/inglês na hora
  // de exibir — o <h1> da página do anime renderizava em branco (achado
  // real da 11ª rodada de auditoria, Epic 18).
  test("título só de zero-width space é tratado como vazio, não sobrescreve o fallback", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/title`, {
      data: { titlePortuguese: "​​​" },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.anime.titlePortuguese).toBeNull();
  });

  test("título acima de 200 caracteres é rejeitado", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/title`, {
      data: { titlePortuguese: "a".repeat(500) },
    });
    expect(res.status()).toBe(400);
  });

  test("título válido continua sendo salvo normalmente", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/title`, {
      data: { titlePortuguese: "Título De Verdade" },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.anime.titlePortuguese).toBe("Título De Verdade");

    // limpa pra não afetar outros testes que rodem depois contra este anime
    await request.patch(`/api/anime/${animeId}/title`, { data: { titlePortuguese: null } });
  });
});
