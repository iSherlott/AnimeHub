import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { loadCast } from "@/lib/workCast";
import { loadThemes } from "@/lib/animeThemes";

/**
 * Admin → Elenco e aberturas (10/11/2026): `{ season, seasonYear, what: "cast" | "themes" }` carrega, para as obras da
 * temporada na plataforma, o elenco (AniList) ou as aberturas e encerramentos (AnimeThemes). Roda em segundo plano
 * (leva alguns minutos, respeitando o limite das fontes) e o resultado vai para Admin → Logs.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { season?: unknown; seasonYear?: unknown; what?: unknown } | null;
  const season = typeof body?.season === "string" && ["WINTER", "SPRING", "SUMMER", "FALL"].includes(body.season) ? body.season : null;
  const seasonYear = Number(body?.seasonYear);
  const what = body?.what === "cast" || body?.what === "themes" ? body.what : null;
  if (!season || !Number.isInteger(seasonYear) || !what) return NextResponse.json({ error: "Escolha a temporada e o que carregar." }, { status: 400 });
  const ids = (await prisma.catalogEntry.findMany({ where: { onPlatform: true, season, seasonYear, anilistId: { not: null } }, select: { anilistId: true } })).map((r) => r.anilistId as number);
  if (ids.length === 0) return NextResponse.json({ error: "Nenhuma obra desta temporada na plataforma." }, { status: 400 });
  const label = what === "cast" ? "elenco" : "aberturas e encerramentos";
  void (async () => {
    try {
      const result = what === "cast" ? await loadCast(ids) : await loadThemes(ids);
      const detail = "characters" in result ? `${result.works} obras com elenco, ${result.characters} personagens` : `${result.works} obras com músicas, ${result.themes} músicas`;
      await prisma.adminLog.create({ data: { level: result.failed ? "WARN" : "INFO", event: `Load ${what}`, message: `Carga de ${label} de ${season} ${seasonYear}: ${detail}${result.failed ? `, ${result.failed} com falha` : ""}.`, adminName: user.displayName } });
    } catch (error) {
      await prisma.adminLog.create({ data: { level: "ERROR", event: `Load ${what}`, message: `Carga de ${label} falhou: ${error instanceof Error ? error.message.slice(0, 200) : "erro"}`, adminName: user.displayName } }).catch(() => undefined);
    }
  })();
  return NextResponse.json({ started: true, works: ids.length }, { status: 202 });
}
