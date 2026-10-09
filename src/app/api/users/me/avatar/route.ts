import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES } from "@/lib/uploadValidation";
import { processImageUpload } from "@/lib/processImageUpload";
import { hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

const MAX_DIMENSION = 512;

/**
 * Upload de avatar (Epic 28) — reaproveita o mesmo pipeline de
 * validação/reencode do upload de post (src/app/api/uploads/route.ts,
 * via src/lib/processImageUpload.ts), só que grava em
 * `storage/uploads/avatars/` com dimensão menor (avatar nunca precisa
 * da resolução de uma imagem de post) e atualiza `User.avatarUrl` na
 * mesma requisição — upload e "salvar no perfil" são o mesmo passo
 * aqui, não 2 chamadas separadas (upload + PATCH).
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limit = hitRateLimit(`avatar:${user.id}`, 10, 10 * 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máximo ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)` },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const result = await processImageUpload(file, request, { kind: "avatars", maxDimension: MAX_DIMENSION });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: result.url } });

  return NextResponse.json({ avatarUrl: result.url }, { status: 201 });
}

/** Remove o avatar (volta pras iniciais) — sem isso, quem envia o
 * arquivo errado fica sem saída nenhuma pra reverter. */
export async function DELETE() {
  const { user, response } = await requireUser();
  if (!user) return response;

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });

  return NextResponse.json({ avatarUrl: null });
}
