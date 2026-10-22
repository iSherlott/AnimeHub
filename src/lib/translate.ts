/**
 * Tradução automática da sinopse (en → pt/ja). Sem chave: MyMemory (grátis,
 * 500 caracteres por pedido). Com `LIBRETRANSLATE_URL`, usa uma instância
 * LibreTranslate própria (sem esse limite). O resultado é guardado no banco
 * (SynopsisTranslation) — cada sinopse é traduzida uma única vez.
 */
export type TranslationTarget = "pt" | "ja";

/** A cota do serviço de tradução acabou (MyMemory grátis: poucos milhares de caracteres por dia). Não adianta tentar de novo agora. */
export class TranslationQuotaError extends Error {
  constructor(message = "Cota de tradução esgotada") {
    super(message);
    this.name = "TranslationQuotaError";
  }
}

/** Qual motor traduz: uma instância LibreTranslate própria (sem cota) ou o MyMemory gratuito (com cota diária pequena). */
export function translationEngine(): "libretranslate" | "mymemory" {
  return process.env.LIBRETRANSLATE_URL ? "libretranslate" : "mymemory";
}

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const CHUNK_LIMIT = 450;

/** Quebra em pedaços ≤ limite, preferindo o fim de frase (nunca no meio de uma palavra). */
export function splitForTranslation(text: string, limit = CHUNK_LIMIT): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [paragraph];
    let current = "";
    for (const sentence of sentences) {
      if (current && (current + sentence).length > limit) {
        chunks.push(current.trim());
        current = "";
      }
      if (sentence.length > limit) {
        // Frase longa demais: corta nos espaços.
        for (const word of sentence.split(/(?<=\s)/)) {
          if (current && (current + word).length > limit) {
            chunks.push(current.trim());
            current = "";
          }
          current += word;
        }
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    chunks.push("\n\n");
  }
  chunks.pop();
  return chunks;
}

type Fetcher = typeof fetch;

async function translateChunk(chunk: string, target: TranslationTarget, fetcher: Fetcher): Promise<string> {
  const libre = process.env.LIBRETRANSLATE_URL;
  if (libre) {
    const res = await fetcher(`${libre.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: chunk, source: "en", target, format: "text", api_key: process.env.LIBRETRANSLATE_API_KEY }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) throw new TranslationQuotaError("LibreTranslate limitou as chamadas");
    if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
    const data = (await res.json()) as { translatedText?: string };
    if (!data.translatedText) throw new Error("LibreTranslate sem texto");
    return data.translatedText;
  }
  const base = process.env.MYMEMORY_URL || MYMEMORY_URL;
  const url = `${base}?q=${encodeURIComponent(chunk)}&langpair=en|${target}`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) throw new TranslationQuotaError();
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
  const text = data.responseData?.translatedText;
  // Cota estourada vem como texto de aviso com status 200/429.
  if (text && /MYMEMORY WARNING/i.test(text)) throw new TranslationQuotaError();
  if (Number(data.responseStatus) === 429) throw new TranslationQuotaError();
  if (!text || Number(data.responseStatus) >= 400) throw new Error("MyMemory sem tradução");
  return text;
}

/** Traduz o texto inteiro; qualquer pedaço que falhe derruba a tradução (devolve erro, nunca texto pela metade). */
export async function translateText(text: string, target: TranslationTarget, fetcher: Fetcher = fetch): Promise<string> {
  const out: string[] = [];
  for (const chunk of splitForTranslation(text)) {
    out.push(chunk === "\n\n" ? chunk : await translateChunk(chunk, target, fetcher));
  }
  return out.join("");
}
