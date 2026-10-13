import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// O HTML do AniDB não diz a que temporada pertence: a carga de primavera já entrou como outono por esse descuido.
// O formulário escolhe a temporada pelas datas e o servidor recusa um rótulo que contradiz o HTML.
const BASE_ID = 29780;
const IDS = Array.from({ length: 7 }, (_, i) => BASE_ID + i);
const DAYS = ["2nd March", "13th March", "5th April", "12th April", "3rd May", "20th May", "1st June"];

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

const html = `<div class="g_bubblewrap g_bubble container">${DAYS.map(
  (day, i) => `
  <div class="g_bubble box no${i}" id="a${IDS[i]}">
    <div class="thumb image"><a href="/anime/${IDS[i]}"><picture><img loading="lazy" alt="Obra Primavera ${i} Round78" src="https://cdn.anidb.net/images/150/${IDS[i]}.jpg-thumb.jpg"></picture></a></div>
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/${IDS[i]}">Obra Primavera ${i} Round78</a></div>
      <div class="date">${day}</div>
      <div class="general">TV Series, 12 eps</div>
    </div>
  </div>`
).join("")}</div>`;

test.describe("Importação — temporada pelas datas do HTML", () => {
  test.use({ storageState: adminState });
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;

  async function cleanup() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: { in: IDS.map(String) } } } } });
    await prisma.catalogEntry.deleteMany({ where: { anidbId: { in: IDS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanup();
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("a API recusa primavera analisada como outono e não deixa job para trás", async ({ request }) => {
    const before = await prisma.adminJob.count();
    const res = await request.post("/api/admin/imports", { data: { html, source: "AniDB", season: "Autumn2026" } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.field).toBe("season");
    expect(body.error).toContain("Primavera");
    expect(body.error).toContain("Autumn2026");
    expect(await prisma.adminJob.count()).toBe(before);
  });

  test("a API recusa o ano errado: verão de 2025 analisado como Summer2026", async ({ request }) => {
    const titled = `<div class="g_bubblewrap g_bubble container">${DAYS.map(
      (_day, i) => `<div class="g_bubble box no${i}" id="a${IDS[i]}"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/${IDS[i]}">Obra Verao ${i} (2025)</a></div><div class="date">${i + 6}th July</div><div class="general">TV Series, 12 eps</div></div></div>`
    ).join("")}</div>`;
    const before = await prisma.adminJob.count();
    const wrong = await request.post("/api/admin/imports", { data: { html: titled, source: "AniDB", season: "Summer2026" } });
    expect(wrong.status()).toBe(422);
    const body = await wrong.json();
    expect(body.field).toBe("season");
    expect(body.error).toContain("2025");
    expect(body.error).toContain("Summer2025");
    expect(await prisma.adminJob.count()).toBe(before);
  });

  test("colar o HTML escolhe a temporada pelas datas e a análise segue com o rótulo certo", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill(html);
    await expect(page.getByTestId("season-detected")).toContainText("Spring2026");
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page).toHaveURL(/\/admin\/importacoes\/\d+$/, { timeout: 30_000 });
    const seq = Number(page.url().split("/").pop());
    expect((await prisma.adminJob.findUniqueOrThrow({ where: { seq } })).season).toBe("Spring2026");
  });
});
