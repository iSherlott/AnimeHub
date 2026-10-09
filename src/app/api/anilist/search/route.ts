import { NextRequest, NextResponse } from "next/server";
import { searchAnimeCatalog, type SearchResult } from "@/lib/searchAnimeCatalog";
import { callInternalService } from "@/lib/serviceDelegate";
import { getCurrentUser } from "@/lib/auth/session";
import { annotateOwnership } from "@/lib/discoverItem";
import { clientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }
  // Cada busca pode virar chamadas à AniList/Kitsu: limita por IP e tamanho.
  const limit = hitRateLimit(`search:${clientIp(request)}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);
  if (q.length > 200) {
    return NextResponse.json({ error: "Busca longa demais" }, { status: 400 });
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
