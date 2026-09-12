"use client";

import { useEffect, useRef, useState } from "react";
import {
  useTitlePreference,
  type JapaneseScript,
  type TitleLanguage,
} from "@/lib/titlePreference";

const LANGUAGE_LABELS: Record<TitleLanguage, string> = {
  pt: "PT",
  en: "EN",
  ja: "JP",
};

const SCRIPT_LABELS: Record<JapaneseScript, string> = {
  romaji: "Romaji",
  furigana: "Kanji + furigana",
  kanji: "Só kanji (kana+kanji)",
};

export function TitleLanguageMenu() {
  const { preference, setPreference } = useTitlePreference();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text-body transition hover:border-jump-red hover:text-jump-red"
        title="Configurações do título"
        aria-label="Configurações do título"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.3-.08.63-.08.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.28.27.42.5.42h3.84c.24 0 .46-.14.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-60 border border-border bg-surface p-3 shadow-lg shadow-black/50">
          <p className="font-display mb-1.5 text-[10px] uppercase tracking-wide text-text-muted">
            Idioma do título
          </p>
          <div className="mb-3 flex gap-2">
            {(Object.keys(LANGUAGE_LABELS) as TitleLanguage[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setPreference({ ...preference, language: lang })}
                className={`flex-1 jump-badge px-2 py-1.5 text-xs font-bold uppercase transition ${
                  preference.language === lang
                    ? "bg-jump-red text-text-primary"
                    : "border border-border bg-surface-raised text-text-muted hover:border-text-muted"
                }`}
              >
                {LANGUAGE_LABELS[lang]}
              </button>
            ))}
          </div>

          {preference.language === "ja" && (
            <>
              <p className="font-display mb-1.5 text-[10px] uppercase tracking-wide text-text-muted">
                Escrita japonesa
              </p>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(SCRIPT_LABELS) as JapaneseScript[]).map((script) => (
                  <button
                    key={script}
                    onClick={() => setPreference({ ...preference, japaneseScript: script })}
                    className={`jump-badge px-2 py-1.5 text-left text-xs font-semibold transition ${
                      preference.japaneseScript === script
                        ? "bg-jump-red text-text-primary"
                        : "border border-border bg-surface-raised text-text-muted hover:border-text-muted"
                    }`}
                  >
                    {SCRIPT_LABELS[script]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
