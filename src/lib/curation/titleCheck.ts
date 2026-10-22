/**
 * Validação dos nomes de uma obra (Epic 45). Tudo que é só "sujeira" de formato (espaços sobrando, entidades HTML, caracteres
 * invisíveis) é corrigido na hora; o que muda o sentido do nome (título só com números, texto corrompido, japonês no campo
 * de inglês) não é adivinhado: vira pendência para alguém conferir.
 */
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", hellip: "…", ndash: "–", mdash: "—" };
const INVISIBLE = /[\u0000-\u001F\u007F​-‍⁠﻿]/g;
// Letras japonesas/coreanas (kana, ideogramas, hangul); a pontuação japonesa (・, 「」) é comum em títulos em inglês e não conta.
const CJK = /[ぁ-ゖァ-ヺー-ヿ㐀-鿿가-힯]/;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Nome sem sujeira de formato; vazio vira null. */
export function cleanTitle(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = decodeEntities(value).replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

export type TitleInput = { titleRomaji: string; titleEnglish: string | null; titleNative: string | null };
export type TitleCheck = {
  /** Campos que mudaram na limpeza (só os que mudaram). */
  fixed: Partial<TitleInput>;
  /** O que ficou errado e precisa de uma pessoa; vazio = nome válido. */
  problems: string[];
};

export function checkTitles(input: TitleInput): TitleCheck {
  const fixed: Partial<TitleInput> = {};
  const romaji = cleanTitle(input.titleRomaji) ?? "";
  if (romaji !== input.titleRomaji) fixed.titleRomaji = romaji;
  const english = cleanTitle(input.titleEnglish);
  if (english !== input.titleEnglish) fixed.titleEnglish = english;
  const native = cleanTitle(input.titleNative);
  if (native !== input.titleNative) fixed.titleNative = native;

  const problems: string[] = [];
  if (romaji === "") problems.push("sem título principal");
  // Só números é legítimo quando a obra tem outro nome de verdade (86, 22/7); só vira pendência se não há nada além disso.
  else if (/^[\d\s.,:;\-–/]+$/.test(romaji) && [english, native].every((t) => !t || /^[\d\s.,:;\-–/]+$/.test(t))) problems.push(`título só com números («${romaji}»)`);
  else if (/^https?:\/\//i.test(romaji)) problems.push("título é um link");
  for (const [label, text] of [["principal", romaji], ["em inglês", english], ["em japonês", native]] as const) {
    if (text && (text.includes("�") || /Ã[\u0080-¿]|â€/.test(text))) problems.push(`caracteres corrompidos no título ${label}`);
  }
  if (english && CJK.test(english)) problems.push("título em inglês com caracteres japoneses/coreanos");
  return { fixed, problems };
}
