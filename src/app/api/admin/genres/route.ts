import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { createGenre, listGenres } from "@/lib/genres";

export const dynamic = "force-dynamic";

/** Admin → Taxonomia (Fase 7): o vocabulário de gêneros com quantas obras cada um tem e possíveis duplicidades. */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json({ genres: await listGenres() }, { headers: { "Cache-Control": "no-store" } });
}

/** Cria (ou registra um não registrado): `{ key, label?, description?, aliases?, adult? }`. */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { key?: unknown; label?: unknown; description?: unknown; aliases?: unknown; adult?: unknown } | null;
  if (typeof body?.key !== "string") return NextResponse.json({ error: "Informe o nome do gênero." }, { status: 400 });
  const result = await createGenre(
    { key: body.key, label: typeof body.label === "string" ? body.label : undefined, description: typeof body.description === "string" ? body.description : null, aliases: Array.isArray(body.aliases) ? body.aliases.filter((a): a is string => typeof a === "string") : [], adult: body.adult === true },
    { id: user.id, name: user.displayName }
  );
  return result.ok ? NextResponse.json({ genre: result.genre }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
