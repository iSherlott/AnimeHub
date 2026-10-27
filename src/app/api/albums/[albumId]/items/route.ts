import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { addAlbumItem } from "@/lib/profileAlbums";

type Params = { params: Promise<{ albumId: string }> };

/** Colocar uma obra da própria lista no álbum: `{ animeId }`. */
export async function PUT(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { animeId?: unknown } | null;
  const result = await addAlbumItem((await params).albumId, user.id, body?.animeId);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
