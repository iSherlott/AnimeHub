import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Carga de obra ANTIGA: quem já acompanha a temporada seguinte (em qualquer situação) recebe a anterior como "terminei"
// assim que o lote é confirmado — sem esperar episódio novo, e mesmo que a produção da anterior ainda não exista.
const OLD = 988001; // temporada 1 (chega pela carga)
const LATER = 988002; // temporada 2 (o usuário já acompanha, dropada)
const ANIDB = 29881;
const IDS = [OLD, LATER];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const html = `<div class="g_bubblewrap g_bubble container">
  <div class="g_bubble box no1" id="a${ANIDB}">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/${ANIDB}">Obra Antiga Round88</a></div>
      <div class="date">5th July</div>
      <div class="general">TV Series, 12 eps</div>
    </div>
  </div>
</div>`;

test.describe.serial("Carga de obra antiga vincula as temporadas anteriores a quem acompanha as seguintes", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: String(ANIDB) } } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: IDS } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: IDS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    // A anterior só existe como cache da AniList (fora da plataforma e SEM produção), como numa carga antiga.
    await prisma.catalogEntry.create({ data: { anilistId: OLD, titleRomaji: "Obra Antiga Round88", season: "SUMMER", seasonYear: 2024, genres: "Comedy", source: "anilist", onPlatform: false } });
    // A seguinte já está na plataforma, com a relação PREQUEL apontando para a anterior, e o usuário a dropou.
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: LATER, name: "Obra Antiga Round88 Dois" } });
    await prisma.production.create({
      data: {
        anilistId: LATER,
        franchiseId: franchise.id,
        titleRomaji: "Obra Antiga Round88 Dois",
        seasonNumber: 2,
        season: "SUMMER",
        seasonYear: 2025,
        format: "TV",
        genres: "Comedy",
        streamingLinksJson: "[]",
        relationsJson: JSON.stringify([{ id: OLD, titleRomaji: "Obra Antiga Round88", format: "TV", relationType: "PREQUEL" }]),
        fetchedAt: new Date(),
      },
    });
    await prisma.catalogEntry.create({ data: { anilistId: LATER, titleRomaji: "Obra Antiga Round88 Dois", season: "SUMMER", seasonYear: 2025, genres: "Comedy", source: "anilist", onPlatform: true } });
    await prisma.anime.create({ data: { userId, anilistId: LATER, titleRomaji: "Obra Antiga Round88 Dois", genres: "Comedy", watchState: "DROPPED", waiting: true, seasonNumber: 2 } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("ao confirmar a carga da temporada antiga, ela entra na lista como terminada e a seguinte não muda", async ({ request }) => {
    expect(await prisma.anime.count({ where: { userId, anilistId: OLD } })).toBe(0);

    const analyzed = await request.post("/api/admin/imports", { data: { html, source: "AniDB", season: "Summer2024" } });
    expect(analyzed.status()).toBe(201);
    const { seq } = await analyzed.json();
    const record = await prisma.importRecord.findFirstOrThrow({ where: { jobSeq: seq, sourceKey: String(ANIDB) } });
    expect(record.matchedAnilistId).toBe(OLD);

    const committed = await request.post(`/api/admin/imports/${seq}/commit`);
    expect(committed.status()).toBe(200);
    expect((await committed.json()).summary.earlierSeasons).toBeGreaterThanOrEqual(1);

    const added = await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: OLD } } });
    expect(added.watchState).toBe("FINISHED");
    expect(added.waiting).toBe(false);
    // A temporada seguinte (dropada) continua exatamente como estava.
    const later = await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: LATER } } });
    expect(later.watchState).toBe("DROPPED");
    expect(later.waiting).toBe(true);
  });

  test("reaplicar o lote é seguro: nada é duplicado nem alterado", async ({ request }) => {
    const job = await prisma.adminJob.findFirstOrThrow({ where: { records: { some: { sourceKey: String(ANIDB) } } }, orderBy: { seq: "desc" } });
    await prisma.anime.update({ where: { userId_anilistId: { userId, anilistId: OLD } }, data: { watchState: "WATCHING" } });
    const res = await request.post(`/api/admin/imports/${job.seq}/reapply`);
    expect(res.status()).toBe(200);
    expect(await prisma.anime.count({ where: { userId, anilistId: OLD } })).toBe(1);
    // O que a pessoa marcou depois nunca é sobrescrito.
    expect((await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: OLD } } })).watchState).toBe("WATCHING");
  });
});
