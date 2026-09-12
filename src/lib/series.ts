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

const SEASON_PATTERNS: Array<{
  regex: RegExp;
  toNumber: (match: RegExpMatchArray) => number;
}> = [
  { regex: /\s+(\d+)(?:st|nd|rd|th)\s+season\b.*$/i, toNumber: (m) => parseInt(m[1], 10) },
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
