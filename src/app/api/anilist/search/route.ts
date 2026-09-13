import { NextRequest, NextResponse } from "next/server";
import { searchAnimeCatalog, type SearchResult } from "@/lib/searchAnimeCatalog";
import { callInternalService } from "@/lib/serviceDelegate";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const delegated = await callInternalService<SearchResult>(
    process.env.CACHE_UPDATER_URL,
    "/search",
    { query: q.trim() }
  );
  if (delegated) return NextResponse.json(delegated);

  try {
    const result = await searchAnimeCatalog(q);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Falha ao buscar na AniList" },
      { status: 502 }
    );
  }
}
