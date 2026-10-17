const ROMAN_NUMERALS: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

const WORD_ORDINALS: Record<string, number> = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

/** "Dai Ni Maku" (= segundo ato/temporada): ordinais em romaji usados nos títulos do AniDB. */
const ROMAJI_ORDINALS: Record<string, number> = { ni: 2, san: 3, yon: 4, shi: 4, go: 5, roku: 6, nana: 7, shichi: 7, hachi: 8, kyuu: 9, ku: 9, juu: 10 };

const KANJI_NUMBERS: Record<string, number> = { 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function kanjiOrDigits(text: string): number {
  return /^\d+$/.test(text) ? parseInt(text, 10) : (KANJI_NUMBERS[text[0]] ?? NaN);
}

const SEASON_PATTERNS: Array<{
  regex: RegExp;
  toNumber: (match: RegExpMatchArray) => number;
}> = [
  { regex: /\s+(\d+)(?:st|nd|rd|th)\s+season\b.*$/i, toNumber: (m) => parseInt(m[1], 10) },
  { regex: /\s+(second|third|fourth|fifth|sixth)\s+season\b.*$/i, toNumber: (m) => WORD_ORDINALS[m[1].toLowerCase()] },
  { regex: /\s+dai\s+(ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|ku|juu)\s*(?:maku|shou|ki|kai)\b.*$/i, toNumber: (m) => ROMAJI_ORDINALS[m[1].toLowerCase()] },
  { regex: /\s*第\s*([二三四五六七八九十\d]+)\s*(?:幕|期|章|部|シーズン)\s*$/, toNumber: (m) => kanjiOrDigits(m[1]) },
  { regex: /\s+season\s+(\d+)\b.*$/i, toNumber: (m) => parseInt(m[1], 10) },
  { regex: /\s+part\s+(\d+)\b.*$/i, toNumber: (m) => parseInt(m[1], 10) },
  {
    regex: /\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/i,
    toNumber: (m) => ROMAN_NUMERALS[m[1].toLowerCase()],
  },
];

/**
 * Deriva uma chave de franquia + número de temporada a partir do título.
 * Ex.: "Jujutsu Kaisen 2nd Season" -> { seriesKey: "jujutsu kaisen", seasonNumber: 2 }
 * "Jujutsu Kaisen" -> { seriesKey: "jujutsu kaisen", seasonNumber: 1 }
 * Só heurística — pode ser sobrescrita manualmente via PATCH.
 */
export function deriveSeriesInfo(title: string): {
  seriesKey: string;
  seasonNumber: number;
} {
  for (const { regex, toNumber } of SEASON_PATTERNS) {
    const match = title.match(regex);
    if (match && typeof match.index === "number") {
      const seasonNumber = toNumber(match);
      const seriesKey = title.slice(0, match.index).trim().toLowerCase();
      if (seriesKey && !Number.isNaN(seasonNumber)) {
        return { seriesKey, seasonNumber };
      }
    }
  }

  return { seriesKey: title.trim().toLowerCase(), seasonNumber: 1 };
}
