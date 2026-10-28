import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadCatalogPage } from "@/lib/catalogServer";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Uma página do catálogo da plataforma para o Explorar (rolagem infinita) — ver `loadCatalogPage`. Devolve
 * `{ items, nextCursor, total }`.
 */
export async function GET(request: Request) {
  const limited = rateLimitedResponse(`catalog-page:${clientIp(request)}`, 300, 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  const page = await loadCatalogPage(new URL(request.url).searchParams, user?.id ?? null);
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
