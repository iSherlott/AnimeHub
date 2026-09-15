import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 901500;

test.describe("Epic 18 — 15ª rodada de auditoria de UX/UI — paginação estável do Feed Recomendado", () => {
  let postIds: string[];

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    // Post não expõe createdAt custom via API — grava direto pra controlar
    // idade de verdade, que é o que faz a pontuação (gravidade) variar.
    await prisma.post.deleteMany({ where: { userId: user.id, anilistId: ANILIST_ID } });
    const now = Date.now();
    const created = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        prisma.post.create({
          data: {
            userId: user.id,
            anilistId: ANILIST_ID,
            animeTitleRomaji: "Anime Round15 Pagination Test",
            body: `Post de paginação estável #${i}`,
            // Idades bem espalhadas — não precisam disputar posição de
            // verdade, só precisam existir pra formar uma janela ranqueável.
            createdAt: new Date(now - i * 20 * 60 * 1000),
          },
        })
      )
    );
    postIds = created.map((p) => p.id).sort();

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.$disconnect();
  });

  // Achado real da 15ª rodada de auditoria (Epic 18): sem fixar o instante
  // usado no cálculo da pontuação, cada requisição recalculava com
  // `new Date()` na hora — e como a taxa de decaimento por idade é
  // diferente post a post, a ordem podia trocar entre uma página e a
  // próxima só pelo tempo passar (sem curtida/post novo nenhum), pulando
  // ou repetindo posts durante uma mesma sessão de rolagem.
  test("a 1ª página devolve um 'since', e reusar esse since mantém a ordem estável mesmo com o tempo passando", async ({
    request,
  }) => {
    const page1 = await request.get("/api/posts?tab=recommended&limit=2");
    expect(page1.ok()).toBe(true);
    const data1 = await page1.json();
    expect(typeof data1.since).toBe("string");
    const since = data1.since;
    const idsAtT0 = data1.posts.map((p: { id: string }) => p.id);

    // Tempo real passa entre as 2 chamadas — é exatamente essa passagem de
    // tempo que corrompia a ordem antes da correção.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const page1Again = await request.get(`/api/posts?tab=recommended&limit=2&since=${encodeURIComponent(since)}`);
    const data1Again = await page1Again.json();
    const idsAgain = data1Again.posts.map((p: { id: string }) => p.id);

    expect(idsAgain).toEqual(idsAtT0);
  });

  test("paginar com o mesmo since não pula nem repete post nenhum da janela", async ({ request }) => {
    const first = await request.get("/api/posts?tab=recommended&limit=2");
    const dataFirst = await first.json();
    const since = dataFirst.since;

    // Busca a janela inteira (posts seedados) numa página só, pro mesmo
    // `since`, como referência do conjunto completo esperado.
    const full = await request.get(`/api/posts?tab=recommended&limit=50&since=${encodeURIComponent(since)}`);
    const dataFull = await full.json();
    const fullIds: string[] = dataFull.posts.map((p: { id: string }) => p.id);
    const seededInFull = fullIds.filter((id) => postIds.includes(id));
    expect(seededInFull.length).toBe(postIds.length);

    // Agora percorre em páginas de 2, sempre com o mesmo since, e confirma
    // que a união bate exatamente com a referência — nenhum post pulado,
    // nenhum repetido.
    const seenIds: string[] = [];
    let offset = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = await request.get(
        `/api/posts?tab=recommended&limit=2&offset=${offset}&since=${encodeURIComponent(since)}`
      );
      const data = await res.json();
      for (const p of data.posts as { id: string }[]) {
        expect(seenIds).not.toContain(p.id); // nunca repete
        seenIds.push(p.id);
      }
      if (typeof data.nextOffset !== "number") break;
      offset = data.nextOffset;
    }

    const seenSeeded = seenIds.filter((id) => postIds.includes(id));
    expect(seenSeeded.sort()).toEqual(postIds);
  });
});
