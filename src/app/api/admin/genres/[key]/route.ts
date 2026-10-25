import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { changeHistory } from "@/lib/changeLog";
import { deleteGenre, genreState, genreWorks, mergeGenre, renameGenreKey, updateGenre } from "@/lib/genres";

export const dynamic = "force-dynamic";

const keyOf = async (params: Promise<{ key: string }>) => decodeURIComponent((await params).key);

/** O gênero, as obras dele (`?pagina=`) e o histórico. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const key = await keyOf(params);
  const genre = await prisma.genre.findUnique({ where: { key } });
  if (!genre) return NextResponse.json({ error: "Gênero não encontrado." }, { status: 404 });
  const page = Math.max(0, Number(new URL(request.url).searchParams.get("pagina")) || 0);
  const [works, history] = await Promise.all([genreWorks(key, page), changeHistory({ entity: "Genre", entityId: key }, 0, 50)]);
  return NextResponse.json({ genre: { ...genre, state: genreState(genre) }, works, history }, { headers: { "Cache-Control": "no-store" } });
}

/** Edita rótulo, descrição, variações, marcador adulto e posição. */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { label?: unknown; description?: unknown; aliases?: unknown; adult?: unknown; position?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  const result = await updateGenre(
    await keyOf(params),
    {
      label: typeof body.label === "string" ? body.label : undefined,
      description: body.description === null || typeof body.description === "string" ? (body.description as string | null) : undefined,
      aliases: Array.isArray(body.aliases) ? body.aliases.filter((a): a is string => typeof a === "string") : undefined,
      adult: typeof body.adult === "boolean" ? body.adult : undefined,
      position: typeof body.position === "number" ? body.position : undefined,
    },
    { id: user.id, name: user.displayName }
  );
  return result.ok ? NextResponse.json({ genre: result.genre }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/**
 * Operações sobre as obras: `{ action: "merge", target, reason? }` · `{ action: "rename", newKey }` ·
 * `{ action: "delete", mode?: "transfer" | "remove", target?, reason? }` (com obras, exige transferir ou remover).
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const key = await keyOf(params);
  const body = (await request.json().catch(() => null)) as { action?: unknown; target?: unknown; newKey?: unknown; mode?: unknown; reason?: unknown } | null;
  const actor = { id: user.id, name: user.displayName };
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";
  let result;
  if (body?.action === "merge" && typeof body.target === "string") result = await mergeGenre(key, body.target, reason, actor);
  else if (body?.action === "rename" && typeof body.newKey === "string") result = await renameGenreKey(key, body.newKey.trim(), actor);
  else if (body?.action === "delete") {
    const mode = body.mode === "transfer" || body.mode === "remove" ? body.mode : undefined;
    result = await deleteGenre(key, { mode, target: typeof body.target === "string" ? body.target : undefined, reason }, actor);
  } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  return result.ok ? NextResponse.json({ works: result.works }) : NextResponse.json({ error: result.error }, { status: result.status });
}
