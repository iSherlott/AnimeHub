import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { UPLOAD_STORAGE_ROOT } from "@/lib/uploadStorage";

type Params = { params: Promise<{ path: string[] }> };

/**
 * Serve de volta um arquivo enviado por POST /api/uploads — pública (a
 * imagem de um post já é pública quando o post é), lê do disco a cada
 * requisição em vez de depender do serving estático embutido do Next em
 * `public/` (ver src/lib/uploadStorage.ts pro motivo: `next start` não
 * serve dinamicamente arquivo criado depois do boot).
 */
export async function GET(request: Request, { params }: Params) {
  const { path: segments } = await params;

  // Nenhum segmento pode escapar de UPLOAD_STORAGE_ROOT (ex.: "..") —
  // resolve o caminho final e confirma que ele continua DENTRO da raiz
  // antes de ler qualquer coisa do disco.
  const filePath = path.join(UPLOAD_STORAGE_ROOT, ...segments);
  if (!filePath.startsWith(UPLOAD_STORAGE_ROOT + path.sep)) {
    return NextResponse.json({ error: "Caminho inválido" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  // Todo upload é reencodificado pra WEBP na criação (POST /api/uploads)
  // — sempre o mesmo Content-Type, sem precisar de tabela de mime-type.
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/webp",
      // Nome de arquivo é um UUID gerado na criação — nunca reaproveitado
      // pra outro conteúdo, então pode cachear por muito tempo.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
