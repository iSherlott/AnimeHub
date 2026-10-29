import { prisma } from "@/lib/prisma";

/**
 * Tamanho real das imagens de fora (banners da AniList/Kitsu), para o banner e o plano de fundo do perfil oferecerem só
 * imagens em Full HD. As capas da AniList têm 460 px de largura e os banners variam de 1000 a 2560 px (amostra da lista
 * real em 28/10: a maioria 1900×400, uns poucos 1900×1069) — esticar os menores deixava o perfil borrado.
 *
 * Mede lendo só o começo do arquivo (o cabeçalho PNG/JPEG/WebP/GIF traz o tamanho) e guarda em `ImageSize`: cada endereço é
 * medido uma vez para todo mundo. Falha grava 0×0 e é tentada de novo um dia depois.
 */
export type ImageDimensions = { width: number; height: number };

/** A AniList guarda banners com no máximo 1900 px de largura: é o "Full HD" dela (1920 px na tela). */
export const FULL_HD_WIDTH = 1900;
/** Altura para cobrir uma tela Full HD (1080 px) sem ampliar: o 16:9 da AniList tem 1900×1069. */
export const FULL_HD_HEIGHT = 1000;
/** Faixa larga como o banner do perfil (168 px de altura na largura da página): pelo menos 3 por 1. */
export const BANNER_MIN_RATIO = 3;

/** Serve para o banner: Full HD de largura e larga o bastante para a faixa do perfil sem cortar quase tudo. */
export function fitsBanner(size: ImageDimensions | undefined): boolean {
  return !!size && size.width >= FULL_HD_WIDTH && size.width / size.height >= BANNER_MIN_RATIO;
}

/** Serve para o plano de fundo: tela cheia em Full HD, para a arte aparecer inteira dos dois lados do perfil. */
export function fitsBackground(size: ImageDimensions | undefined): boolean {
  return !!size && size.width >= FULL_HD_WIDTH && size.height >= FULL_HD_HEIGHT;
}

/** O tamanho escrito no cabeçalho do arquivo, ou null quando o formato não é conhecido. */
export function parseImageSize(buf: Uint8Array): ImageDimensions | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ascii = (at: number, len: number) => String.fromCharCode(...buf.subarray(at, at + len));
  // PNG: o bloco IHDR vem logo depois da assinatura.
  if (buf.length >= 24 && buf[0] === 0x89 && ascii(1, 3) === "PNG") return { width: view.getUint32(16), height: view.getUint32(20) };
  // GIF: largura e altura logo depois de "GIF89a".
  if (buf.length >= 10 && ascii(0, 3) === "GIF") return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  // WebP: com perdas (VP8), sem perdas (VP8L) ou estendido (VP8X).
  if (buf.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    return null;
  }
  // JPEG: percorre os marcadores até o SOF (início do quadro), que traz altura e largura.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      i += 2 + view.getUint16(i + 2);
    }
  }
  return null;
}

/** Bytes lidos de cada imagem: o cabeçalho do JPEG pode vir depois de uma miniatura EXIF grande. */
const HEAD_BYTES = 256 * 1024;
const TIMEOUT_MS = 6000;
const CONCURRENCY = 16;
const RETRY_FAILED_MS = 24 * 60 * 60 * 1000;

async function measure(url: string): Promise<ImageDimensions | null> {
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) return null;
    // Servidor que ignora o Range manda o arquivo inteiro: lê só o começo.
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let read = 0;
    while (read < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      read += value.length;
    }
    void reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(read);
    let at = 0;
    for (const p of parts) {
      buf.set(p, at);
      at += p.length;
    }
    return parseImageSize(buf);
  } catch {
    return null;
  }
}

/**
 * O tamanho de cada endereço (https). Com `measureMissing`, mede na hora os que ainda não têm medida (ou cuja medição
 * falhou há mais de um dia) e guarda; sem ele, só o que já foi medido.
 */
export async function imageSizes(urls: string[], { measureMissing = false } = {}): Promise<Map<string, ImageDimensions>> {
  const wanted = Array.from(new Set(urls.filter((u) => /^https:\/\//i.test(u))));
  const sizes = new Map<string, ImageDimensions>();
  if (wanted.length === 0) return sizes;
  const known = await prisma.imageSize.findMany({ where: { url: { in: wanted } } });
  const stale = Date.now() - RETRY_FAILED_MS;
  const done = new Set<string>();
  for (const k of known) {
    if (k.width > 0 && k.height > 0) sizes.set(k.url, { width: k.width, height: k.height });
    if (k.width > 0 || k.measuredAt.getTime() > stale) done.add(k.url);
  }
  if (!measureMissing) return sizes;
  const missing = wanted.filter((u) => !done.has(u));
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const measured = await Promise.all(batch.map(async (url) => ({ url, size: await measure(url) })));
    for (const { url, size } of measured) if (size) sizes.set(url, size);
    await Promise.all(
      measured.map(({ url, size }) => {
        const data = { width: size?.width ?? 0, height: size?.height ?? 0, measuredAt: new Date() };
        return prisma.imageSize.upsert({ where: { url }, create: { url, ...data }, update: data }).catch(() => undefined);
      }),
    );
  }
  return sizes;
}
