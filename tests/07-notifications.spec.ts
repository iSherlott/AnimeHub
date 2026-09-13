import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

test.describe("Notificações — favoritos no ar agora (Epic 10)", () => {
  let alertId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });

    // Simula o que o services/notifier escreveria — os testes não sobem
    // esse serviço, só verificam que o BFF lê/atualiza a tabela certo.
    const alert = await prisma.airingAlert.upsert({
      where: {
        userId_anilistId_episode: { userId: user.id, anilistId: anime.anilistId, episode: 1 },
      },
      create: {
        userId: user.id,
        anilistId: anime.anilistId,
        episode: 1,
        airingAt: new Date(),
      },
      update: { seenAt: null },
    });
    alertId = alert.id;
    await prisma.$disconnect();
  });

  test("GET /api/notifications retorna o alerta com dados do anime", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const found = data.alerts.find((a: { id: string }) => a.id === alertId);
    expect(found).toBeTruthy();
    expect(found.seenAt).toBeNull();
    expect(found.animeId).toBeTruthy();
    expect(found.titleRomaji).toBeTruthy();
    expect(data.unseenCount).toBeGreaterThanOrEqual(1);
  });

  test("POST /api/notifications/:id/seen marca como visto", async ({ request }) => {
    const seenRes = await request.post(`/api/notifications/${alertId}/seen`);
    expect(seenRes.status()).toBe(200);

    const listRes = await request.get("/api/notifications");
    const data = await listRes.json();
    const found = data.alerts.find((a: { id: string }) => a.id === alertId);
    expect(found.seenAt).toBeTruthy();
  });

  test("marcar um alerta inexistente como visto retorna 404", async ({ request }) => {
    const res = await request.post("/api/notifications/does-not-exist/seen");
    expect(res.status()).toBe(404);
  });

  test("outro usuário não consegue marcar o alerta de alguém como visto", async ({ request }) => {
    const res = await request.post(`/api/notifications/${alertId}/seen`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("Notificações exigem login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET /api/notifications retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.status()).toBe(401);
  });

  test("POST /api/notifications/:id/seen retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/notifications/anything/seen");
    expect(res.status()).toBe(401);
  });
});
