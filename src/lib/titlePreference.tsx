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

/** Como TitleSet, mas sem nenhum campo garantido — episódios e alertas não
 * têm o mesmo lastro de dado que Anime.titleRomaji (sempre preenchido). */
export type PartialTitleSet = {
  titleRomaji?: string | null;
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
      if (raw) {
        // Mesma exceção de hidratação de discover/page.tsx: SSR nunca vê
        // localStorage, então precisa hidratar aqui (pós-montagem), não no
        // inicializador do useState — o lint não modela isso, falso positivo.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferenceState(JSON.parse(raw));
      }
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

/**
 * Como resolveTitleText, mas pra quando nenhum campo é garantido (grade de
 * episódios, alertas de "no ar agora") — em vez de forjar um TitleSet
 * colocando o que sobrar (às vezes texto em japonês) no slot de
 * titleRomaji pra satisfazer o tipo, o que já causou um bug real (esse
 * texto vazando pro branch errado quando o campo realmente preferido
 * também está vazio, exibindo japonês cru como se fosse o título em
 * inglês), percorre só os campos compatíveis com a preferência e cai pro
 * placeholder quando nenhum deles existir — nunca atravessa de "quero
 * script latino" pra "só tenho nativo" ou vice-versa em silêncio.
 */
export function resolveTitleTextLenient(
  preference: TitlePreference,
  titles: PartialTitleSet,
  placeholder: string
): string {
  // "en"/"pt" e o script romaji/furigana de "ja" pedem texto em escrita
  // latina — degradam entre si (afinal um título em inglês ainda é uma
  // informação válida se não tiver tradução em português, etc.), mas nunca
  // caem pro nativo (kanji/kana), que seria trocar script sem avisar.
  // "kanji" é o único caso que efetivamente quer o nativo — aí sim cair pro
  // romaji faz sentido (ainda é "o título em japonês", só noutra escrita).
  const order: (keyof PartialTitleSet)[] =
    preference.language === "pt"
      ? ["titlePortuguese", "titleEnglish", "titleRomaji"]
      : preference.language === "en"
        ? ["titleEnglish", "titleRomaji"]
        : preference.japaneseScript === "kanji"
          ? ["titleNative", "titleRomaji", "titleEnglish", "titlePortuguese"]
          : ["titleRomaji", "titleNative", "titleEnglish", "titlePortuguese"];

  for (const key of order) {
    const value = titles[key];
    if (value) return value;
  }
  return placeholder;
}
