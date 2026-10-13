import { NextResponse } from "next/server";
import { loadAvailableSeasons } from "@/lib/availableSeasons";

/** Temporadas que têm anime na plataforma (para o filtro de temporada). Leitura pública. */
export async function GET() {
  return NextResponse.json({ seasons: await loadAvailableSeasons() });
}
