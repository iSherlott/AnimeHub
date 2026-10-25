import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadEpisodesPage, parseEpisodesFilters } from "@/lib/adminEpisodes";

export const dynamic = "force-dynamic";

/** Admin → Episódios (Fase 4): episódios globais, filtrados e paginados no servidor (os mesmos filtros da página). */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const filters = parseEpisodesFilters(new URL(request.url).searchParams);
  return NextResponse.json(await loadEpisodesPage(filters), { headers: { "Cache-Control": "no-store" } });
}
