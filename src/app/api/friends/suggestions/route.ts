import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { friendSuggestions } from "@/lib/friends";

export const dynamic = "force-dynamic";

/** Sugestões de amizade (as mesmas da página Amigos): `?take=` de 1 a 8. Lateral do Feed. */
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const take = Math.min(8, Math.max(1, Number(new URL(request.url).searchParams.get("take")) || 3));
  return NextResponse.json({ people: await friendSuggestions(user.id, take) }, { headers: { "Cache-Control": "no-store" } });
}
