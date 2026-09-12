"use client";

import { useState } from "react";

type TitleEntry = { language: string; title: string; isOfficial: boolean };

const LANGUAGE_LABELS: Record<string, string> = {
  "x-jat": "Romaji",
  ja: "Japonês",
  en: "Inglês",
  pt: "Português",
  "pt-br": "Português (BR)",
  de: "Alemão",
  fr: "Francês",
  es: "Espanhol",
  it: "Italiano",
  ru: "Russo",
  ko: "Coreano",
  zh: "Chinês",
};

export function OtherTitles({ titlesJson }: { titlesJson: string | null }) {
  const [open, setOpen] = useState(false);
  if (!titlesJson) return null;

  let titles: TitleEntry[] = [];
  try {
    titles = JSON.parse(titlesJson);
  } catch {
    return null;
  }
  if (titles.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-text-muted underline-offset-2 hover:text-text-body hover:underline"
      >
        {open ? "▾" : "▸"} Outros títulos ({titles.length}) — via AniDB
      </button>
      {open && (
        <ul className="mt-2 grid grid-cols-1 gap-1 border-l-2 border-border pl-3 text-xs sm:grid-cols-2">
          {titles.map((t, i) => (
            <li key={i} className="text-text-body">
              <span className="text-text-muted">
                {LANGUAGE_LABELS[t.language] ?? t.language}:
              </span>{" "}
              {t.title}
              {t.isOfficial && <span className="ml-1 text-jump-yellow">★</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
