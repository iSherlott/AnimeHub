"use client";

import { useEffect, useState } from "react";
import { Typography, type TypographyProps } from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { htmlToPlainText } from "@/lib/plainText";
import { useTitlePreference } from "@/lib/titlePreference";

type Lang = "pt" | "ja";

const cache = new Map<string, string | null>();

/**
 * Idioma da sinopse: segue o idioma dos títulos (português → pt, inglês →
 * original); com títulos em japonês vale a escolha do perfil (padrão pt).
 */
export function useSynopsisTarget(): Lang | null {
  const { preference } = useTitlePreference();
  const user = useCurrentUser();
  if (preference.language === "pt") return "pt";
  if (preference.language === "en") return null;
  return user?.preferences.synopsisLanguage ?? "pt";
}

function useTranslatedSynopsis(anilistId: number | null | undefined, target: Lang | null, skip: boolean): string | null {
  const key = anilistId && target ? `${anilistId}:${target}` : null;
  const [, force] = useState(0);
  useEffect(() => {
    if (!key || skip || cache.has(key)) return;
    let cancelled = false;
    cache.set(key, null);
    fetch(`/api/synopsis?anilistId=${anilistId}&lang=${target}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { synopsis?: { text: string; translated: boolean } | null } | null) => {
        // Se a tradução falhou, não guarda: a próxima montagem tenta de novo.
        if (data?.synopsis?.translated) cache.set(key, data.synopsis.text);
        else cache.delete(key);
        if (!cancelled) force((n) => n + 1);
      })
      .catch(() => cache.delete(key));
    return () => {
      cancelled = true;
    };
  }, [key, skip, anilistId, target]);
  return key ? (cache.get(key) ?? null) : null;
}

/**
 * Texto da sinopse no idioma da preferência. Mostra o original (inglês) enquanto
 * a tradução chega e se ela falhar. A sinopse em português digitada pelo dono
 * (DescriptionEditor) tem prioridade sobre a tradução automática.
 */
export function useSynopsis(description: string | null | undefined, anilistId?: number | null, descriptionPortuguese?: string | null): string {
  const target = useSynopsisTarget();
  const manual = target === "pt" && descriptionPortuguese ? descriptionPortuguese : null;
  const translated = useTranslatedSynopsis(anilistId, target, Boolean(manual) || !description);
  return htmlToPlainText(manual ?? translated ?? description);
}

export function SynopsisText({
  description,
  anilistId,
  descriptionPortuguese,
  empty = "Sem sinopse disponível.",
  ...props
}: { description: string | null | undefined; anilistId?: number | null; descriptionPortuguese?: string | null; empty?: string } & Omit<TypographyProps, "children">) {
  const text = useSynopsis(description, anilistId, descriptionPortuguese);
  return (
    <Typography data-testid="synopsis" {...props} sx={{ whiteSpace: "pre-wrap", ...props.sx }}>
      {text || empty}
    </Typography>
  );
}
