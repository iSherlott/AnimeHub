import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 901501;

test.describe("Epic 18 — 15ª rodada de auditoria de UX/UI — remover anime limpa o alerta de 'no ar agora'", () => {
  let animeId: string;
  let userId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;

    await prisma.airingAlert.deleteMany({ where: { userId: user.id, anilistId: ANILIST_ID } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round15 Orphan Alert Test", genres: "" },
      update: {},
    });
    animeId = anime.id;

    // Simula o que o services/notifier já teria escrito (mesmo padrão de
    // tests/07-notifications.spec.ts) — o alerta existe antes de remover o
    // anime.
    await prisma.airingAlert.create({
      data: { userId: user.id, anilistId: ANILIST_ID, episode: 1, airingAt: new Date() },
    });

    await prisma.$disconnect();
  });

  // Achado real da 15ª rodada de auditoria (Epic 18): AiringAlert não tem
  // FK pro Anime (de propósito — sobrevive remover/readicionar o mesmo
  // anilistId), mas sem limpar na hora de remover de vez, o alerta ficava
  // órfão (sem anime pra resolver) até a retenção de 7 dias do notifier
  // expirar, inflando a contagem de não-vistos com uma entrada que não
  // leva a lugar nenhum.
  test("remover o anime também remove o AiringAlert correspondente", async ({ request }) => {
    const before = await request.get("/api/notifications");
    const dataBefore = await before.json();
    expect(
      dataBefore.alerts.some((a: { anilistId: number }) => a.anilistId === ANILIST_ID)
    ).toBe(true);

    const del = await request.delete(`/api/anime/${animeId}`);
    expect(del.ok()).toBe(true);

    const after = await request.get("/api/notifications");
    const dataAfter = await after.json();
    expect(
      dataAfter.alerts.some((a: { anilistId: number }) => a.anilistId === ANILIST_ID)
    ).toBe(false);
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.airingAlert.deleteMany({ where: { userId, anilistId: ANILIST_ID } });
    await prisma.$disconnect();
  });
});
