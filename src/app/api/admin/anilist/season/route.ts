import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { defaultImportDeps, previewSeason, type Season } from "@/lib/anilistImport";
import { seasonLabel } from "@/lib/exploreGroups";
import { withProgressJob } from "@/lib/progressJob";

const SEASONS: readonly string[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

/**
 * Admin → AniList: lista a temporada na AniList para o admin ESCOLHER o que trazer. Só consulta (e guarda como cache
 * invisível); nada entra na plataforma aqui. Conteúdo adulto é contado e deixado de fora.
 */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const season = params.get("season") ?? "";
  const year = Number(params.get("seasonYear"));
  if (!SEASONS.includes(season) || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Temporada inválida" }, { status: 400 });
  }
  try {
    const label = seasonLabel({ season: season as Season, year });
    const result = await withProgressJob<Awaited<ReturnType<typeof previewSeason>>>(
      { kind: "ANILIST", source: "AniList", label: `Buscar ${label}`, stage: "NORMALIZE", actor: { id: user.id, name: user.displayName }, summarize: (r) => ({ obras: r.items.length, bloqueadas: r.blocked }) },
      (report) => previewSeason(season as Season, year, defaultImportDeps, report)
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin-anilist] temporada falhou:", error);
    return NextResponse.json({ error: "Não foi possível consultar a AniList agora. Tente novamente em instantes." }, { status: 502 });
  }
}
