import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { curateCatalog, getCurationStatus } from "@/lib/curation/engine";

export const dynamic = "force-dynamic";

/** Quantas obras dá para curar de novo numa só chamada (`anilistIds`). */
const MAX_PICKED = 200;

/** Admin → Curadoria: andamento da curadoria do catálogo (progresso, o que foi corrigido, tipos e pendências). */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json(await getCurationStatus(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Inicia a curadoria em segundo plano (`{ force? }`): sem `force`, só passa pelas obras ainda não curadas na versão atual
 * das regras (retoma de onde parou); com `force`, refaz o catálogo inteiro. Responde 202 com o job; 409 se já houver um rodando.
 */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  let body: { force?: unknown; anilistIds?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.force !== undefined && typeof body.force !== "boolean") return NextResponse.json({ error: "force deve ser um booleano" }, { status: 400 });
  let anilistIds: number[] | undefined;
  if (body.anilistIds !== undefined) {
    const list = body.anilistIds;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_PICKED || !list.every((n) => Number.isInteger(n) && n > 0)) {
      return NextResponse.json({ error: `anilistIds deve ter de 1 a ${MAX_PICKED} ids da AniList` }, { status: 400 });
    }
    anilistIds = list as number[];
  }
  const status = await getCurationStatus();
  if (status.job?.state === "RUNNING" && status.progress && Date.now() - Date.parse(status.progress.updatedAt) < 10 * 60 * 1000) {
    return NextResponse.json({ error: "Já existe uma curadoria em andamento.", seq: status.job.seq }, { status: 409 });
  }
  void curateCatalog({ actor: { id: user.id, name: user.displayName }, force: body.force === true, anilistIds }).catch((error) => console.error("[curadoria] falhou:", error));
  return NextResponse.json({ started: true }, { status: 202 });
}
