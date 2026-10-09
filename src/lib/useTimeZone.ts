"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { resolveTimeZone } from "@/lib/timeZone";

/**
 * Fuso efetivo para exibir horários (D-07): preferência da conta ("device"
 * ou IANA) ou, sem conta/preferência, America/Sao_Paulo — o padrão do
 * Figma. Substitui o "fuso do navegador" implícito de antes, que nunca era
 * mostrado ao usuário.
 */
export function useTimeZone(): string {
  const user = useCurrentUser();
  const preference = user?.preferences?.timeZone ?? null;
  return useMemo(
    () => resolveTimeZone(preference, Intl.DateTimeFormat().resolvedOptions().timeZone),
    [preference]
  );
}
