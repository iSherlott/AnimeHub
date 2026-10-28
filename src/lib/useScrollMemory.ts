"use client";

import { useEffect, useRef, useState } from "react";

// Instante do último "voltar"/"avançar" do navegador. O App Router não remonta nada no popstate em si, mas a página de
// destino monta logo depois; se montou até alguns segundos após o evento, a pessoa voltou para ela.
let lastPopAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopAt = Date.now();
  });
}

/** A página montou porque a pessoa voltou (ou avançou) pelo navegador, e não por um link. */
export function useCameBack(): boolean {
  const [cameBack] = useState(() => typeof window !== "undefined" && Date.now() - lastPopAt < 4000);
  return cameBack;
}

/** Lê/grava um valor da sessão (some ao fechar a aba). Falha em silêncio quando o navegador bloqueia o armazenamento. */
export function readSession<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem armazenamento a página só não lembra a posição.
  }
}

/**
 * Lembra onde a pessoa estava na página e, quando ela volta pelo navegador, devolve a rolagem a esse ponto. Serve às
 * páginas que carregam o conteúdo no navegador (calendário, aba Animes do perfil): o navegador tenta restaurar antes de
 * o conteúdo existir e acaba no topo. `ready` diz quando o conteúdo chegou; com rolagem infinita, a página pode ainda
 * estar mais curta que a posição guardada, então tenta de novo por alguns segundos enquanto mais itens chegam.
 */
export function useScrollMemory(key: string, ready: boolean) {
  const cameBack = useCameBack();
  const storageKey = `scroll:${key}`;
  const restored = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => writeSession(storageKey, window.scrollY), 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || restored.current || !cameBack) return;
    restored.current = true;
    const target = readSession<number>(storageKey);
    if (!target || target <= 0) return;
    const startedAt = Date.now();
    let frame = 0;
    // Se a pessoa mexer na página enquanto ainda tentamos, ela manda: paramos de puxar a rolagem.
    const stop = () => window.clearTimeout(frame);
    const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    events.forEach((name) => window.addEventListener(name, stop, { passive: true, once: true }));
    const attempt = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 4 && Date.now() - startedAt < 4000) frame = window.setTimeout(attempt, 150);
    };
    attempt();
    return () => {
      stop();
      events.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [ready, cameBack, storageKey]);
}
