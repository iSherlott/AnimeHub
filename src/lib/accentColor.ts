import sharp from "sharp";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — anime cover/banner images are small, this is a generous safety cap
const SAMPLE_SIZE = 48; // resize target — small enough to be fast, big enough to sample real hue variety
const HUE_BUCKETS = 12; // 30° wide buckets
const ACCENT_SATURATION = 0.55;
const ACCENT_LIGHTNESS = 0.42; // clamp so the accent always reads well fading into the theme's #0b0b0d anchor

/**
 * Extrai uma cor de destaque a partir da capa/banner de um anime — nunca
 * lança: qualquer falha (rede, timeout, imagem corrompida) retorna null,
 * mesmo padrão de "nenhuma fonte de enriquecimento bloqueia as outras" já
 * usado em refreshAnimeData.ts.
 */
export async function extractAccentColor(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHub/1.0)" },
    });
    if (!res.ok || !res.body) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) return null;

    // Lê em stream em vez de res.arrayBuffer() — um servidor que omite ou
    // mente sobre Content-Length não consegue forçar um buffer sem limite
    // antes de qualquer verificação de tamanho rodar.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        controller.abort();
        return null;
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    const { data, info } = await sharp(buffer)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "cover" })
      .toColorspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const hue = dominantHue(data, info.channels);
    if (hue === null) return null;

    return hslToHex(hue, ACCENT_SATURATION, ACCENT_LIGHTNESS);
  } catch (error) {
    console.error("Falha ao extrair cor de destaque:", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Agrupa os pixels amostrados em baldes de matiz (hue), ponderados pela
 * saturação de cada pixel — assim um fundo cinza/branco extenso não vence
 * simplesmente por área, e a cor escolhida tende a ser a mais "viva" da
 * imagem, não só a mais comum.
 */
function dominantHue(pixels: Buffer, channels: number): number | null {
  const buckets = new Array<number>(HUE_BUCKETS).fill(0);

  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const { h, s, l } = rgbToHsl(r, g, b);

    // Ignora pixels quase pretos/brancos/sem cor — não carregam matiz útil.
    if (s < 0.15 || l < 0.08 || l > 0.92) continue;

    const bucket = Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS;
    buckets[bucket] += s;
  }

  let bestBucket = -1;
  let bestWeight = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i] > bestWeight) {
      bestWeight = buckets[i];
      bestBucket = i;
    }
  }

  if (bestBucket === -1) return null;
  return bestBucket * (360 / HUE_BUCKETS) + 360 / HUE_BUCKETS / 2;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
