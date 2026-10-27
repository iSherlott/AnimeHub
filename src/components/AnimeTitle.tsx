"use client";

import { sanitizeFuriganaHtml } from "@/lib/plainText";
import { resolveTitleText, useTitlePreference, type TitleSet } from "@/lib/titlePreference";

export function AnimeTitle({
  titles,
  furiganaHtml,
  className,
}: {
  titles: TitleSet;
  furiganaHtml?: string | null;
  className?: string;
}) {
  const { preference } = useTitlePreference();
  const isJapaneseScript =
    preference.language === "ja" && preference.japaneseScript !== "romaji";
  const jpClass = isJapaneseScript ? "font-jp" : "";
  const combined = [className, jpClass].filter(Boolean).join(" ");

  if (preference.language === "ja" && preference.japaneseScript === "furigana") {
    if (furiganaHtml) {
      return (
        <span
          className={combined}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: sanitizeFuriganaHtml(furiganaHtml) }}
        />
      );
    }
    return <span className={combined}>{titles.titleNative || titles.titleRomaji}</span>;
  }

  return <span className={combined}>{resolveTitleText(preference, titles)}</span>;
}

/**
 * Os outros títulos da obra, abaixo do principal: só os que não repetem o que já está no título (com a preferência de
 * japonês, o título principal já é o japonês; então a linha de baixo mostra o romaji e o inglês).
 */
export function AnimeAltTitles({ titles }: { titles: TitleSet }) {
  const { preference } = useTitlePreference();
  const main = resolveTitleText(preference, titles);
  const seen = new Set([main]);
  const lines = [titles.titleNative, titles.titleRomaji, titles.titleEnglish].filter((t): t is string => {
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((t, i) => (
        <span key={t} data-testid="anime-alt-title" className={t === titles.titleNative ? "font-jp" : undefined} lang={t === titles.titleNative ? "ja" : undefined} style={{ display: "block", fontSize: i === 0 ? "1.15rem" : "0.875rem", marginTop: i === 0 ? 4 : 0 }}>
          {t}
        </span>
      ))}
    </>
  );
}
