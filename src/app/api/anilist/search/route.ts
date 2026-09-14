import { NextRequest, NextResponse } from "next/server";
import { searchAnimeCatalog, type SearchResult } from "@/lib/searchAnimeCatalog";
import { callInternalService } from "@/lib/serviceDelegate";
import { getCurrentUser } from "@/lib/auth/session";
import { annotateOwnership } from "@/lib/discoverItem";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const user = await getCurrentUser();

  const delegated = await callInternalService<SearchResult>(
    process.env.CACHE_UPDATER_URL,
    "/search",
    { query: q.trim() }
  );
  if (delegated) {
    return NextResponse.json({
      ...delegated,
      results: await annotateOwnership(delegated.results, user?.id ?? null),
    });
  }

  try {
    const result = await searchAnimeCatalog(q);
    return NextResponse.json({
      ...result,
      results: await annotateOwnership(result.results, user?.id ?? null),
    });
  } catch {
    return NextResponse.json(
      { error: "Falha ao buscar na AniList" },
      { status: 502 }
    );
  }
}
