import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteAlbum, updateAlbum } from "@/lib/profileAlbums";

type Params = { params: Promise<{ albumId: string }> };

/** Renomear ou mudar a descrição: `{ name?, description? }` (só o dono). */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await updateAlbum((await params).albumId, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Apagar o álbum (as obras continuam na lista). */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteAlbum((await params).albumId, user.id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
