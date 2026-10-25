"use client";

import { useEffect } from "react";

/**
 * Avisa antes de sair da página com alterações não salvas (Fase 9, §19): fechar a aba, recarregar ou navegar para fora.
 * O navegador mostra a mensagem dele; nada é salvo nem descartado sozinho.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
