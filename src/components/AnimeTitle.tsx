"use client";

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
          dangerouslySetInnerHTML={{ __html: furiganaHtml }}
        />
      );
    }
    return <span className={combined}>{titles.titleNative || titles.titleRomaji}</span>;
  }

  return <span className={combined}>{resolveTitleText(preference, titles)}</span>;
}
