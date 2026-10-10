import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listNews, type NewsScope } from "@/lib/newsFeed";

/**
 * Notícias das obras da temporada (Comunidade → Notícias). Pública para ler;
 * o escopo "following" (obras que a pessoa acompanha) exige sessão.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scope: NewsScope = params.get("scope") === "following" ? "following" : "all";
  const user = await getCurrentUser();
  if (scope === "following" && !user) {
    return NextResponse.json({ error: "Entre para ver as notícias do que você acompanha." }, { status: 401 });
  }
  const beforeRaw = params.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const result = await listNews({ scope, userId: user?.id ?? null, q: params.get("q") ?? "", before: before && !Number.isNaN(before.getTime()) ? before : null });
  return NextResponse.json(result);
}
