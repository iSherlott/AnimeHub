"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type TitleLanguage = "pt" | "en" | "ja";
export type JapaneseScript = "romaji" | "furigana" | "kanji";

export type TitlePreference = {
  language: TitleLanguage;
  japaneseScript: JapaneseScript;
};

export type TitleSet = {
  titleRomaji: string;
  titleEnglish?: string | null;
  titleNative?: string | null;
  titlePortuguese?: string | null;
};

const DEFAULT_PREFERENCE: TitlePreference = {
  language: "en",
  japaneseScript: "romaji",
};

const STORAGE_KEY = "anime-hub:title-preference";

const TitlePreferenceContext = createContext<{
  preference: TitlePreference;
  setPreference: (preference: TitlePreference) => void;
} | null>(null);

export function TitlePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<TitlePreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPreferenceState(JSON.parse(raw));
    } catch {
      // localStorage indisponível (aba privada etc.) — fica no padrão.
    }
  }, []);

  function setPreference(next: TitlePreference) {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // idem — falha silenciosa, é só uma preferência de exibição.
    }
  }

  return (
    <TitlePreferenceContext.Provider value={{ preference, setPreference }}>
      {children}
    </TitlePreferenceContext.Provider>
  );
}

export function useTitlePreference() {
  const ctx = useContext(TitlePreferenceContext);
  if (!ctx) {
    throw new Error("useTitlePreference precisa estar dentro de TitlePreferenceProvider");
  }
  return ctx;
}

/** Resolução em texto puro — usada nos cards, onde furigana não cabe. */
export function resolveTitleText(preference: TitlePreference, titles: TitleSet): string {
  if (preference.language === "pt") {
    return titles.titlePortuguese || titles.titleEnglish || titles.titleRomaji;
  }
  if (preference.language === "en") {
    return titles.titleEnglish || titles.titleRomaji;
  }
  // japonês
  if (preference.japaneseScript === "kanji") {
    return titles.titleNative || titles.titleRomaji;
  }
  // "romaji" e "furigana" caem pro romaji em contexto de texto puro —
  // a versão com <ruby> só é usada pelo componente <AnimeTitle>.
  return titles.titleRomaji;
}
