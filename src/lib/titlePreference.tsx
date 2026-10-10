"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

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

/** Padrão do produto: Japonês (kanji+kana+inglês) — Figma `8:183`/`8:3333`. */
export const DEFAULT_PREFERENCE: TitlePreference = {
  language: "ja",
  japaneseScript: "kanji",
};

/** Formato da conta (Configurações) → preferência de exibição. */
export function preferenceFromAccountFormat(format: "ja" | "romaji" | null | undefined): TitlePreference | null {
  if (format === "ja") return { language: "ja", japaneseScript: "kanji" };
  if (format === "romaji") return { language: "ja", japaneseScript: "romaji" };
  return null;
}

const STORAGE_KEY = "anime-hub:title-preference";

const TitlePreferenceContext = createContext<{
  preference: TitlePreference;
  setPreference: (preference: TitlePreference) => void;
  /** Esquece a escolha local (menu) para a preferência da conta voltar a valer. */
  clearLocalPreference: () => void;
} | null>(null);

/**
 * Precedência: escolha local explícita no menu (localStorage) > formato da
 * conta (Configurações) > padrão do produto (Japonês).
 */
export function TitlePreferenceProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [local, setLocal] = useState<TitlePreference | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // Mesma exceção de hidratação de discover/page.tsx: SSR nunca vê
        // localStorage, então precisa hidratar aqui (pós-montagem), não no
        // inicializador do useState — o lint não modela isso, falso positivo.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocal(JSON.parse(raw));
      }
    } catch {
      // localStorage indisponível (aba privada etc.) — fica no padrão.
    }
  }, []);

  function setPreference(next: TitlePreference) {
    setLocal(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // idem — falha silenciosa, é só uma preferência de exibição.
    }
  }

  function clearLocalPreference() {
    setLocal(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // idem.
    }
  }

  const accountPreference = preferenceFromAccountFormat(user?.preferences?.titleFormat);
  const preference = local ?? accountPreference ?? DEFAULT_PREFERENCE;

  return (
    <TitlePreferenceContext.Provider value={{ preference, setPreference, clearLocalPreference }}>
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

/**
 * Como resolveTitleText, mas pra descrição — só 2 variantes possíveis (a
 * original, sempre presente, vinda do AniList; e a portuguesa, preenchida
 * manualmente, ver DescriptionEditor), então não precisa de uma função pura
 * genérica: já é um hook, usado tanto em AnimeDescription (página de
 * detalhe) quanto em HeroBanner (destaque de /minha-lista) — os 2 lugares
 * que mostram a descrição de um anime.
 */
export function useLocalizedDescription(description: string, descriptionPortuguese?: string | null): string {
  const { preference } = useTitlePreference();
  return preference.language === "pt" && descriptionPortuguese ? descriptionPortuguese : description;
}

/** Resolução em texto puro — usada nos cards, onde furigana não cabe. */
export function resolveTitleText(preference: TitlePreference, titles: TitleSet): string {
  if (preference.language === "pt") {
    return titles.titlePortuguese || titles.titleEnglish || titles.titleRomaji;
  }
  if (preference.language === "en") {
    return titles.titleEnglish || titles.titleRomaji;
  }
  // japonês: "kanji" e "kanji + furigana" mostram o título original (a leitura vai
  // em ruby/linha de kana nos componentes que a suportam); só "romaji" usa o romaji.
  if (preference.japaneseScript === "kanji" || preference.japaneseScript === "furigana") {
    return titles.titleNative || titles.titleRomaji;
  }
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
        : preference.japaneseScript === "kanji" || preference.japaneseScript === "furigana"
          ? ["titleNative", "titleRomaji", "titleEnglish", "titlePortuguese"]
          : ["titleRomaji", "titleNative", "titleEnglish", "titlePortuguese"];

  for (const key of order) {
    const value = titles[key];
    if (value) return value;
  }
  return placeholder;
}
