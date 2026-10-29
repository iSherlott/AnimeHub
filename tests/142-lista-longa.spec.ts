import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

// Pedido de 28/10: "Assistindo", "Não terminei", "Dropei" e "Terminei" não mostravam obras marcadas. A lista do perfil
// lia só as 500 temporadas mais recentes; quem tinha 800 perdia as mais antigas (e com elas quase todo o "Não terminei"
// e todo o "Dropei"). Aqui uma lista de 520 temporadas com as marcações justamente nas mais antigas.
const EMAIL = "lista-142@test.local";
const BASE_ID = 1420000;
const TOTAL = 520;
const MARKED = { DROPPED: 0, UNFINISHED: 1, WATCHING: 2, FINISHED: 3 } as const;

test.describe.serial("Lista longa: as marcações das obras mais antigas aparecem", () => {
  let prisma: PrismaClient;
  let ownerId = "";

  async function clean() {
    await prisma.anime.deleteMany({ where: { user: { email: EMAIL } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    ownerId = (await prisma.user.create({ data: { email: EMAIL, displayName: "Lista Round142", handle: "lista_r142", passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" } })).id;
    const start = Date.UTC(2024, 0, 1);
    const stateOf = (i: number) => (Object.entries(MARKED).find(([, at]) => at === i)?.[0] as keyof typeof MARKED | undefined) ?? null;
    // As primeiras são as mais antigas (createdAt menor): eram as que ficavam de fora.
    await prisma.anime.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        userId: ownerId,
        anilistId: BASE_ID + i,
        titleRomaji: `Obra Round142 #${i}#`,
        genres: "",
        status: "FINISHED",
        watchState: stateOf(i),
        createdAt: new Date(start + i * 60_000),
      })),
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("cada categoria traz a obra marcada, mesmo depois da 500ª temporada", async ({ request }) => {
    const all = await (await request.get(`/api/users/${ownerId}/animes?limit=1`)).json();
    expect(all.total).toBe(TOTAL);
    expect(all.categories).toMatchObject({ dropped: 1, unfinished: 1, watching: 1 });
    expect(all.categories.finished).toBe(TOTAL - 3);
    for (const [state, i] of Object.entries(MARKED)) {
      const category = { DROPPED: "dropped", UNFINISHED: "unfinished", WATCHING: "watching", FINISHED: "finished" }[state];
      const res = await (await request.get(`/api/users/${ownerId}/animes?category=${category}&q=${encodeURIComponent(`#${i}#`)}`)).json();
      expect(res.entries.map((e: { anilistId: number }) => e.anilistId), state).toContain(BASE_ID + i);
    }
  });

  test("os álbuns automáticos do perfil também contam as mais antigas", async ({ page }) => {
    await page.goto(`/users/${ownerId}`);
    const albums = page.getByTestId("profile-albums");
    await expect(albums.getByTestId("album-dropei")).toContainText(/(^|\D)1 anime\b/);
    await expect(albums.getByTestId("album-nao-terminei")).toContainText(/(^|\D)1 anime\b/);
  });
});
