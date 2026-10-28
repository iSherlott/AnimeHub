import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES } from "@/lib/uploadValidation";
import { processImageUpload } from "@/lib/processImageUpload";
import { hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

const MAX_DIMENSION = 2048;

/**
 * Upload real de imagem (Epic 26) — primeira infraestrutura de upload
 * deste app; antes disso, todo campo de imagem em qualquer lugar era só
 * URL colada. `POST /api/anime/[id]/posts` continua validando
 * `imageUrls` com `isValidHttpUrl` (exige URL ABSOLUTA, `new URL()`
 * lançaria num caminho relativo) — por isso esta rota devolve a URL já
 * absoluta (origin da própria requisição + caminho), em vez de mudar
 * aquela validação pra aceitar caminho local (raio de explosão grande,
 * várias suítes de teste já postam URL externa arbitrária ali).
 *
 * Arquivo salvo em `storage/uploads/posts/<ano-mês>/` (ver
 * src/lib/uploadStorage.ts pra saber por que não é dentro de `public/`)
 * e servido de volta por GET /api/uploads/[...path]
 * (src/app/api/uploads/[...path]/route.ts). Em produção (Docker), esse
 * caminho precisa de um volume montado em cima (ver docker-compose.yml)
 * pra persistir entre restarts.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limit = hitRateLimit(`upload:${user.id}`, 30, 10 * 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

  // Rejeita ANTES de `request.formData()` ler o corpo inteiro pra
  // memória — sem essa checagem, um POST de centenas de MB (autenticado,
  // mas ainda assim) já teria bufferizado tudo antes de `isWithinMaxSize`
  // sequer rodar (achado real da revisão de código desta entrega).
  // `Content-Length` pode faltar (ex.: chunked), nesse caso deixa passar
  // pra `isWithinMaxSize` pegar depois do parse mesmo.
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

  const result = await processImageUpload(file, request, { kind: "posts", maxDimension: MAX_DIMENSION, animated: true });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url, width: result.width, height: result.height }, { status: 201 });
}
