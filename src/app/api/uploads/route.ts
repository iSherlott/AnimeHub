import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/auth/session";
import {
  isAllowedImageFormat,
  isWithinMaxSize,
  MAX_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
} from "@/lib/uploadValidation";
import { UPLOAD_STORAGE_ROOT } from "@/lib/uploadStorage";

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
  if (!isWithinMaxSize(file.size)) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máximo ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Num try/catch só, do começo ao fim — `metadata()` só lê o cabeçalho,
  // não decodifica o pixel inteiro; um arquivo com cabeçalho válido mas
  // dado de pixel corrompido passa por `metadata()` sem erro e só quebra
  // de verdade dentro de `toBuffer()` (confirmado ao vivo: um PNG
  // corrompido gerava 500 cru em vez do 400 esperado, porque só a 1ª
  // chamada estava protegida). As 2 etapas precisam do mesmo tratamento.
  let outBuffer: Buffer;
  let info: { width: number; height: number };
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    if (!isAllowedImageFormat(metadata.format)) {
      return NextResponse.json({ error: "Arquivo não é uma imagem válida" }, { status: 400 });
    }
    // Reencodifica sempre pra WEBP — normaliza formato, tira EXIF
    // (inclusive dado de geolocalização, se houver) e capa a dimensão
    // máxima, tudo num só passo, independente do formato/tamanho de
    // origem.
    const result = await image
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    outBuffer = result.data;
    info = result.info;
  } catch {
    return NextResponse.json({ error: "Arquivo não é uma imagem válida" }, { status: 400 });
  }

  const monthBucket = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const filename = `${randomUUID()}.webp`;
  const dir = path.join(UPLOAD_STORAGE_ROOT, "posts", monthBucket);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), outBuffer);

  const origin = new URL(request.url).origin;
  const url = `${origin}/api/uploads/posts/${monthBucket}/${filename}`;

  return NextResponse.json({ url, width: info.width, height: info.height }, { status: 201 });
}
