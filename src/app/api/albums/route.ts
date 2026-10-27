import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createAlbum } from "@/lib/profileAlbums";

/** Criar um álbum no próprio perfil: `{ name, description? }`. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await createAlbum(user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ id: result.id }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
