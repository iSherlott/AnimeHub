import { NextResponse } from "next/server";
import { getTopRanked } from "@/lib/catalogCache";
import { getCurrentUser } from "@/lib/auth/session";
import { annotateOwnership, discoverItemFromCatalogEntry } from "@/lib/discoverItem";

/** Fileira "🔥 Em alta" do Descobrir — inspirada no ranking do Bilibili. */
export async function GET() {
  const user = await getCurrentUser();
  const entries = await getTopRanked(10);
  const results = await annotateOwnership(
    entries.map(discoverItemFromCatalogEntry),
    user?.id ?? null
  );
  return NextResponse.json({ results });
}
