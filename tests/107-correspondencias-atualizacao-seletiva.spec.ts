import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Fase 6: Correspondências (lado a lado, risco exige motivo, revisar depois, exportar, histórico) e a atualização
// seletiva de campos (Cenário F): coleta sem tocar no catálogo, diferenças, campos protegidos, prévia, execução,
// conflito quando o valor mudou desde a coleta, e reprocessamento — contra uma AniList falsa.
const ANIDB_ONLY = 107901;
const CANDIDATE = 107001;
const FU1 = 107101; // diverge: sinopse vazia aqui; inglês protegido
const FU2 = 107102; // tudo igual
const FU3 = 107103; // a AniList não devolve
const ALL = [CANDIDATE, FU1, FU2, FU3];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const media = (id: number, romaji: string, extra: Record<string, unknown> = {}) => ({
  id,
  idMal: null,
  title: { romaji, english: null, native: null },
  coverImage: { extraLarge: null },
  bannerImage: null,
  description: null,
  episodes: null,
  status: null,
  format: null,
  season: null,
  seasonYear: null,
  genres: [],
  averageScore: null,
  startDate: null,
  endDate: null,
  nextAiringEpisode: null,
  externalLinks: [],
  ...extra,
});
const MEDIA = [
  media(CANDIDATE, "Correspondencia Round107", { format: "TV", seasonYear: 2021 }),
  media(FU1, "Atualizar Round107 Um", { title: { romaji: "Atualizar Round107 Um", english: "New English", native: null }, description: "Sinopse nova da AniList.", genres: ["Drama"] }),
  media(FU2, "Atualizar Round107 Dois", { genres: ["Drama"] }),
];

test.describe.serial("Correspondências e atualização seletiva", () => {
  let prisma: PrismaClient;
  let anilist: Server;
  let fu1Id: string;
  let seq: number;

  async function clean() {
    await prisma.adminLog.deleteMany({ where: { context: { contains: "Round107" } } });
    await prisma.adminLog.deleteMany({ where: { context: `Correspondências · anidb:${ANIDB_ONLY}` } });
    await prisma.anidbCandidate.deleteMany({ where: { anidbId: ANIDB_ONLY } });
    const jobs = await prisma.fieldUpdateItem.findMany({ where: { anilistId: { in: ALL } }, select: { jobSeq: true } });
    await prisma.changeLog.deleteMany({ where: { batchId: { in: jobs.map((j) => `field-update-${j.jobSeq}`) } } });
    await prisma.adminJob.deleteMany({ where: { seq: { in: jobs.map((j) => j.jobSeq) } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anilistId: { in: ALL } }, { anidbId: ANIDB_ONLY }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const wanted = new Set(((variables.ids as number[]) ?? (variables.id ? [variables.id as number] : [])) as number[]);
        res.setHeader("Content-Type", "application/json");
        const list = MEDIA.filter((m) => wanted.has(m.id));
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media: list, airingSchedules: [] }, Media: list[0] ?? null } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    await prisma.catalogEntry.create({ data: { anidbId: ANIDB_ONLY, titleRomaji: "Correspondencia Round107", source: "anidb", onPlatform: true, format: "TV", seasonYear: 2020, kind: "EPISODE" } });
    await prisma.catalogEntry.create({ data: { anilistId: CANDIDATE, titleRomaji: "Correspondencia Round107", source: "anilist", onPlatform: false, format: "TV", seasonYear: 2021, kind: "EPISODE" } });
    await prisma.anidbCandidate.create({ data: { anidbId: ANIDB_ONLY, anilistId: CANDIDATE, candidateTitle: "Correspondencia Round107", score: 0.8, reason: "título igual, ano diferente" } });
    fu1Id = (await prisma.catalogEntry.create({ data: { anilistId: FU1, titleRomaji: "Atualizar Round107 Um", titleEnglish: "Old English", genres: "Drama", source: "anilist", onPlatform: true, manualFields: ["titleEnglish"] } })).id;
    await prisma.catalogEntry.create({ data: { anilistId: FU2, titleRomaji: "Atualizar Round107 Dois", genres: "Drama", source: "anilist", onPlatform: true } });
    await prisma.catalogEntry.create({ data: { anilistId: FU3, titleRomaji: "Atualizar Round107 Tres", source: "anilist", onPlatform: true } });
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("só o administrador vê correspondências e cria lotes", async ({ request }) => {
    expect((await request.get("/api/admin/correspondences")).status()).toBe(403);
    expect((await request.get("/api/admin/correspondences/export")).status()).toBe(403);
    expect((await request.post(`/api/admin/correspondences/anidb/${ANIDB_ONLY}`, { data: { action: "reject" } })).status()).toBe(403);
    expect((await request.post("/api/admin/field-updates", { data: { ids: [] } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("correspondências: lado a lado, o que coincide e diverge, e o risco exige motivo", async ({ page, request }) => {
      const list = await (await request.get("/api/admin/correspondences?q=Round107")).json();
      const row = list.rows.find((r: { key: string }) => r.key === `anidb:${ANIDB_ONLY}`);
      expect(row.matching).toEqual(expect.arrayContaining(["título", "formato"]));
      expect(row.diverging).toEqual(["ano"]);
      expect(row.risky).toBe(true);

      await page.goto("/admin/correspondencias?q=Round107");
      await page.getByTestId(`correspondence-link-anidb:${ANIDB_ONLY}`).click();
      await expect(page.getByTestId("correspondence-compare")).toContainText("2020");
      await expect(page.getByTestId("correspondence-compare")).toContainText("2021");
      await expect(page.getByTestId("correspondence-impact")).toContainText("diverge em ano");
      await page.getByTestId("correspondence-confirm").click();
      await expect(page.getByTestId("correspondence-message")).toContainText("diga o motivo");

      // Revisar depois: sai da fila pendente e aparece em "Revisar depois".
      await page.getByTestId("correspondence-later").click();
      await expect(page.getByTestId("correspondence-message")).toContainText("Decisão registrada");
      expect((await prisma.anidbCandidate.findUniqueOrThrow({ where: { anidbId: ANIDB_ONLY } })).status).toBe("LATER");
      const later = await (await request.get("/api/admin/correspondences?q=Round107&estado=depois")).json();
      expect(later.rows.map((r: { key: string }) => r.key)).toContain(`anidb:${ANIDB_ONLY}`);

      const csv = await (await request.get("/api/admin/correspondences/export?q=Round107&estado=todas")).text();
      expect(csv.split("\n")[0]).toContain("titulo_recebido");
      expect(csv).toContain(String(ANIDB_ONLY));
    });

    test("rejeitar fica no histórico com quem decidiu", async ({ page, request }) => {
      expect((await request.post(`/api/admin/correspondences/anidb/${ANIDB_ONLY}`, { data: { action: "reject", reason: "É outra temporada" } })).status()).toBe(200);
      expect((await prisma.anidbCandidate.findUniqueOrThrow({ where: { anidbId: ANIDB_ONLY } })).status).toBe("REJECTED");
      await page.goto(`/admin/correspondencias/anidb/${ANIDB_ONLY}`);
      await expect(page.getByTestId("correspondence-history")).toContainText("É outra temporada");
      await expect(page.getByTestId("correspondence-decision")).toContainText("já foi decidida");
    });

    test("atualização seletiva: coleta sem mudar o catálogo e mostra as diferenças campo a campo", async ({ request }) => {
      const created = await request.post("/api/admin/field-updates", { data: { ids: [fu1Id, (await prisma.catalogEntry.findFirstOrThrow({ where: { anilistId: FU2 } })).id, (await prisma.catalogEntry.findFirstOrThrow({ where: { anilistId: FU3 } })).id], label: "Round107" } });
      expect(created.status()).toBe(201);
      seq = (await created.json()).seq;
      // Nada mudou ainda.
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: fu1Id } })).description).toBeNull();

      const data = await (await request.get(`/api/admin/field-updates/${seq}`)).json();
      const state = Object.fromEntries(data.items.map((i: { anilistId: number; state: string }) => [i.anilistId, i.state]));
      expect(state).toEqual({ [FU1]: "COLLECTED", [FU2]: "COLLECTED", [FU3]: "NOT_FOUND" });
      const fu1 = data.items.find((i: { anilistId: number }) => i.anilistId === FU1);
      const by = (field: string) => fu1.diff.find((d: { field: string }) => d.field === field);
      expect(by("description")).toMatchObject({ current: null, incoming: "Sinopse nova da AniList.", changed: true, protected: false });
      expect(by("titleEnglish")).toMatchObject({ current: "Old English", incoming: "New English", changed: true, protected: true });
      // Campo que a AniList não informa não vira vazio.
      expect(by("coverImage")).toMatchObject({ missing: true, changed: false });
      const fu2 = data.items.find((i: { anilistId: number }) => i.anilistId === FU2);
      expect(fu2.diff.some((d: { changed: boolean }) => d.changed)).toBe(false);
    });

    test("escolha por grupo preserva o protegido; a prévia diz o que vai mudar; executar aplica e registra o lote", async ({ page, request }) => {
      await page.goto(`/admin/atualizacoes/${seq}`);
      await page.getByTestId("fu-group-titulos").click();
      await page.getByTestId("fu-group-sinopse").click();
      await page.getByTestId("fu-select").click();
      await expect(page.getByTestId("fu-message")).toContainText("Escolha salva: 1 campo(s)");
      await expect(page.getByTestId("fu-preview-affected")).toContainText("1 de 3 obra(s)");
      await expect(page.getByTestId("fu-preview-protected")).toContainText("Valores manuais preservados: 1");
      await page.getByTestId("fu-apply").click();
      await expect(page.getByTestId("fu-result")).toContainText("1 atualizada(s)");

      const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: fu1Id } });
      expect(entry.description).toBe("Sinopse nova da AniList.");
      expect(entry.titleEnglish).toBe("Old English");
      expect(entry.manualFields).toEqual(["titleEnglish"]);
      const log = await prisma.changeLog.findFirstOrThrow({ where: { batchId: `field-update-${seq}`, field: "description" } });
      expect(log).toMatchObject({ origin: "IMPORT", jobSeq: seq });

      expect((await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "apply" } })).status()).toBe(409);
      const retry = await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "retry" } });
      expect(retry.status()).toBe(200);
      expect((await retry.json()).retried).toBe(1);
    });

    test("sobrescrever protegido exige confirmação; valor que mudou desde a coleta vira conflito", async ({ request }) => {
      const created = await request.post("/api/admin/field-updates", { data: { ids: [fu1Id] } });
      const seq2 = (await created.json()).seq as number;
      const sel = await request.post(`/api/admin/field-updates/${seq2}`, { data: { action: "select", fields: ["titleEnglish"], includeProtected: true } });
      expect((await sel.json()).preview).toMatchObject({ affected: 1, protectedOverwritten: 1, needsConfirmation: true });
      expect((await request.post(`/api/admin/field-updates/${seq2}`, { data: { action: "apply" } })).status()).toBe(400);

      // Alguém editou o título em inglês depois da coleta.
      await prisma.catalogEntry.update({ where: { id: fu1Id }, data: { titleEnglish: "Edited Meanwhile" } });
      const applied = await request.post(`/api/admin/field-updates/${seq2}`, { data: { action: "apply", confirm: true } });
      expect((await applied.json()).result).toMatchObject({ conflicts: 1, applied: 0 });
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: fu1Id } })).titleEnglish).toBe("Edited Meanwhile");
      const item = await prisma.fieldUpdateItem.findFirstOrThrow({ where: { jobSeq: seq2 } });
      expect(item.state).toBe("CONFLICT");
      expect(item.message).toContain("Mudou desde a coleta");
    });
  });
});
