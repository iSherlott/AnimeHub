"use client";

import { useEffect, useState } from "react";
import { Typography, type TypographyProps } from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { htmlToPlainText } from "@/lib/plainText";
import { useTitlePreference } from "@/lib/titlePreference";

type Lang = "pt" | "ja";

/** Traduções já guardadas na obra (vêm prontas do servidor, então a sinopse nasce no idioma certo, sem piscar em inglês). */
export type StoredSynopsis = { pt?: string | null; ja?: string | null };

export type SynopsisStatus = "original" | "translated" | "pending" | "unavailable";

const cache = new Map<string, string | null>();

export const SYNOPSIS_PENDING_TEXT = "Traduzindo a sinopse…";

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

function useTranslatedSynopsis(anilistId: number | null | undefined, target: Lang | null, skip: boolean): { text: string | null; failed: boolean } {
  const key = anilistId && target ? `${anilistId}:${target}` : null;
  const [, force] = useState(0);
  // Chaves cuja tradução não veio nesta montagem: a tela mostra o original com aviso em vez de ficar "traduzindo" para sempre.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!key || skip || cache.has(key)) return;
    let cancelled = false;
    cache.set(key, null);
    fetch(`/api/synopsis?anilistId=${anilistId}&lang=${target}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { synopsis?: { text: string; translated: boolean } | null } | null) => {
        // Se a tradução falhou, não guarda: a próxima montagem tenta de novo.
        if (data?.synopsis?.translated) cache.set(key, data.synopsis.text);
        else {
          cache.delete(key);
          if (!cancelled) setFailedKeys((prev) => new Set(prev).add(key));
        }
        if (!cancelled) force((n) => n + 1);
      })
      .catch(() => {
        cache.delete(key);
        if (!cancelled) setFailedKeys((prev) => new Set(prev).add(key));
      });
    return () => {
      cancelled = true;
    };
  }, [key, skip, anilistId, target]);
  return { text: key ? (cache.get(key) ?? null) : null, failed: key !== null && failedKeys.has(key) };
}

/**
 * Texto da sinopse no idioma da preferência e em que pé está a tradução. Ordem: a sinopse em português digitada pelo dono
 * (DescriptionEditor), a tradução já guardada na obra (`stored`), a tradução buscada na hora. Enquanto ela chega o estado é
 * `pending` (a tela diz "Traduzindo…", não mostra o inglês); se não puder ser feita, `unavailable` devolve o original.
 */
export function useSynopsisState(
  description: string | null | undefined,
  anilistId?: number | null,
  descriptionPortuguese?: string | null,
  stored?: StoredSynopsis
): { text: string; status: SynopsisStatus } {
  const target = useSynopsisTarget();
  const manual = target === "pt" && descriptionPortuguese ? descriptionPortuguese : null;
  const saved = target ? stored?.[target] ?? null : null;
  const translated = useTranslatedSynopsis(anilistId, target, Boolean(manual) || Boolean(saved) || !description);
  if (manual) return { text: htmlToPlainText(manual), status: "translated" };
  if (saved) return { text: htmlToPlainText(saved), status: "translated" };
  if (!description) return { text: "", status: "original" };
  if (!target) return { text: htmlToPlainText(description), status: "original" };
  if (translated.text) return { text: htmlToPlainText(translated.text), status: "translated" };
  // Sem `anilistId` (obra só do AniDB) não há o que buscar; com ele, é "traduzindo" até a resposta chegar.
  if (!anilistId || translated.failed) return { text: htmlToPlainText(description), status: "unavailable" };
  return { text: SYNOPSIS_PENDING_TEXT, status: "pending" };
}

export function useSynopsis(description: string | null | undefined, anilistId?: number | null, descriptionPortuguese?: string | null, stored?: StoredSynopsis): string {
  return useSynopsisState(description, anilistId, descriptionPortuguese, stored).text;
}

export function SynopsisText({
  description,
  anilistId,
  descriptionPortuguese,
  stored,
  empty = "Sem sinopse disponível.",
  ...props
}: { description: string | null | undefined; anilistId?: number | null; descriptionPortuguese?: string | null; stored?: StoredSynopsis; empty?: string } & Omit<TypographyProps, "children">) {
  const { text, status } = useSynopsisState(description, anilistId, descriptionPortuguese, stored);
  return (
    <>
      <Typography data-testid="synopsis" aria-busy={status === "pending" || undefined} {...props} sx={{ whiteSpace: "pre-wrap", ...(status === "pending" ? { fontStyle: "italic", color: "text.secondary" } : {}), ...props.sx }}>
        {text || empty}
      </Typography>
      {status === "unavailable" && (
        <Typography data-testid="synopsis-untranslated" sx={{ fontSize: 12, color: "text.secondary" }}>
          Sinopse original, em inglês: a tradução não está disponível agora.
        </Typography>
      )}
    </>
  );
}
