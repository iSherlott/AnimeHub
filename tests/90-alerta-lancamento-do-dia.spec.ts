import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { startOfDayInZone } from "../src/lib/timeZone";

// O aviso de lançamento é do dia de HOJE (no fuso da pessoa): episódio de amanhã não aparece "um dia antes" no sino.
// "Data alterada" e "voltou a sair episódios" continuam aparecendo, porque falam de uma data futura de propósito.
const ZONE = "America/Sao_Paulo"; // fuso padrão de quem não escolheu um
const TODAY = 990001; // acabou de ir ao ar
const TOMORROW = 990002; // vai ao ar amanhã
const MOVED = 990003; // adiado para amanhã (data alterada)
const BACK = 990004; // voltou a sair episódios (próximo episódio em dias)
const IDS = [TODAY, TOMORROW, MOVED, BACK];

test.describe.serial("Sino de lançamentos — só o dia de hoje", () => {
  let prisma: PrismaClient;
  let userId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.airingAlert.deleteMany({ where: { userId, anilistId: { in: IDS } } });
    const now = new Date();
    const tomorrowNoon = new Date(startOfDayInZone(now, ZONE).getTime() + 36 * 3600_000);
    await prisma.airingAlert.createMany({
      data: [
        { userId, anilistId: TODAY, episode: 3, airingAt: new Date(now.getTime() - 5 * 60_000) },
        { userId, anilistId: TOMORROW, episode: 4, airingAt: tomorrowNoon },
        { userId, anilistId: MOVED, episode: 5, airingAt: tomorrowNoon, previousAiringAt: new Date(now.getTime() - 60 * 60_000) },
        { userId, anilistId: BACK, episode: 0, airingAt: new Date(tomorrowNoon.getTime() + 3 * 24 * 3600_000), kind: "RETURN" },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.airingAlert.deleteMany({ where: { userId, anilistId: { in: IDS } } });
    await prisma.$disconnect();
  });

  test("o episódio de amanhã não gera aviso, mas o de hoje, a data alterada e o retorno sim", async ({ request }) => {
    const data = await (await request.get("/api/notifications")).json();
    const ids = (data.alerts as Array<{ anilistId: number }>).map((a) => a.anilistId);
    expect(ids).toContain(TODAY);
    expect(ids).not.toContain(TOMORROW);
    expect(ids).toContain(MOVED);
    expect(ids).toContain(BACK);
  });

  test("quando o dia chega, o mesmo aviso aparece (nada se perde)", async ({ request }) => {
    // O dia do episódio de amanhã chegou: o aviso guardado passa a valer.
    await prisma.airingAlert.updateMany({ where: { userId, anilistId: TOMORROW }, data: { airingAt: new Date(Date.now() + 2 * 60_000) } });
    const nowDay = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
    const inTwo = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(Date.now() + 2 * 60_000));
    test.skip(nowDay !== inTwo, "a virada do dia no fuso padrão caiu nos próximos 2 minutos");
    const data = await (await request.get("/api/notifications")).json();
    expect((data.alerts as Array<{ anilistId: number }>).map((a) => a.anilistId)).toContain(TOMORROW);
  });
});
