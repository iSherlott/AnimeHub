import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { removeAlbumItem } from "@/lib/profileAlbums";

type Params = { params: Promise<{ albumId: string; animeId: string }> };

/** Tirar a obra do álbum (ela continua na lista). */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { albumId, animeId } = await params;
  const result = await removeAlbumItem(albumId, user.id, animeId);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
