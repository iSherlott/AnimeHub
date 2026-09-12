import { NextResponse } from "next/server";
import { getTopRanked } from "@/lib/catalogCache";
import { discoverItemFromCatalogEntry } from "@/lib/discoverItem";

/** Fileira "🔥 Em alta" do Descobrir — inspirada no ranking do Bilibili. */
export async function GET() {
  const entries = await getTopRanked(10);
  return NextResponse.json({ results: entries.map(discoverItemFromCatalogEntry) });
}
