import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { searchForLink } from "@/lib/anidbCandidates";

/** Admin → Match name → Obras sem página: busca na AniList para escolher a obra certa. */
export async function GET(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ works: await searchForLink(q) });
  } catch {
    return NextResponse.json({ error: "A AniList não respondeu agora. Tente novamente em instantes." }, { status: 502 });
  }
}
