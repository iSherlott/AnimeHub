import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Epic 16: o hero da home deve girar entre pelo menos 3 animes da lista
// quando existirem, não só entre favoritos (o único gatilho de rotação até
// então, via Epic 4's HeroBannerRotator). O usuário de teste tem 7 animes
// seedados (global-setup.ts) e nenhum favorito por padrão — cenário exato
// que antes desta correção mostrava só 1 hero fixo, sem girar nunca.
test.describe("Hero da home gira entre os animes da lista (Epic 16)", () => {
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    // Garante nenhum favorito, independente da ordem de outros specs que
    // também mexem em isFavorite (08-favorite.spec.ts já desfaz o próprio
    // toggle, mas este teste não deve depender disso).
    await prisma.anime.updateMany({
      where: { userId: user.id },
      data: { isFavorite: false, favoritedAt: null },
    });
    await prisma.$disconnect();
  });

  test("mostra pelo menos 3 animes distintos ao longo da rotação, sem nenhum favorito marcado", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/minha-lista");

    const heroTitle = page.getByRole("heading", { level: 1 });
    const titlesSeen = new Set<string>();
    titlesSeen.add((await heroTitle.textContent())?.trim() ?? "");

    for (let i = 0; i < 3; i++) {
      await page.clock.fastForward(8100);
      titlesSeen.add((await heroTitle.textContent())?.trim() ?? "");
    }

    expect(titlesSeen.size).toBeGreaterThanOrEqual(3);
  });
});
