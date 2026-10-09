import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isAllowedImageFormat, isWithinMaxSize, MAX_UPLOAD_BYTES } from "@/lib/uploadValidation";
import { UPLOAD_STORAGE_ROOT } from "@/lib/uploadStorage";

/**
 * Miolo de validação/reencode/gravação de upload de imagem (Epic 26),
 * extraído de `src/app/api/uploads/route.ts` pra ser reaproveitado pelo
 * upload de avatar (Epic 28) sem duplicar a lógica de sharp. `kind`
 * vira a subpasta em `storage/uploads/<kind>/<ano-mês>/<uuid>.webp`
 * (ver src/lib/uploadStorage.ts pra por que fica fora de `public/`).
 */
export type ProcessImageUploadResult =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; error: string; status: number };

export async function processImageUpload(
  file: File,
  request: Request,
  opts: { kind: string; maxDimension: number }
): Promise<ProcessImageUploadResult> {
  if (!isWithinMaxSize(file.size)) {
    return {
      ok: false,
      error: `Arquivo muito grande (máximo ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)`,
      status: 400,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Num try/catch só, do começo ao fim — `metadata()` só lê o cabeçalho,
  // um arquivo com cabeçalho válido mas dado de pixel corrompido só
  // quebra de verdade dentro de `toBuffer()` (mesmo achado do upload de
  // post original: as 2 etapas precisam do mesmo tratamento).
  let outBuffer: Buffer;
  let info: { width: number; height: number };
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    if (!isAllowedImageFormat(metadata.format)) {
      return { ok: false, error: "Arquivo não é uma imagem válida", status: 400 };
    }
    const result = await image
      .resize({ width: opts.maxDimension, height: opts.maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    outBuffer = result.data;
    info = result.info;
  } catch {
    return { ok: false, error: "Arquivo não é uma imagem válida", status: 400 };
  }

  const monthBucket = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const filename = `${randomUUID()}.webp`;
  const dir = path.join(UPLOAD_STORAGE_ROOT, opts.kind, monthBucket);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), outBuffer);

  const origin = new URL(request.url).origin;
  const url = `${origin}/api/uploads/${opts.kind}/${monthBucket}/${filename}`;

  return { ok: true, url, width: info.width, height: info.height };
}
