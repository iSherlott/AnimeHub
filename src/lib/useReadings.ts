"use client";

import { useEffect, useState } from "react";

export type Reading = { kana: string; html: string };

const cache = new Map<string, Reading | null>();
const queue = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const CHUNK = 80;

async function flush() {
  timer = null;
  const texts = Array.from(queue);
  queue.clear();
  for (let i = 0; i < texts.length; i += CHUNK) {
    const part = texts.slice(i, i + CHUNK);
    try {
      const res = await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: part }) });
      const data: { readings?: Record<string, Reading> } = res.ok ? await res.json() : {};
      for (const text of part) cache.set(text, data.readings?.[text] ?? null);
    } catch {
      for (const text of part) cache.set(text, null);
    }
  }
  listeners.forEach((l) => l());
}

/**
 * Leitura (kana + furigana) de um título japonês. Os pedidos de todos os
 * componentes da tela saem num só lote (um POST), e cada título é consultado
 * uma vez por sessão. Sem texto (ou enquanto carrega) devolve `null`.
 */
export function useReading(text: string | null | undefined): Reading | null {
  const [, force] = useState(0);
  const key = text?.trim() || null;

  useEffect(() => {
    if (!key) return;
    const onChange = () => force((n) => n + 1);
    listeners.add(onChange);
    if (!cache.has(key)) {
      cache.set(key, null);
      queue.add(key);
      if (!timer) timer = setTimeout(() => void flush(), 30);
    }
    return () => {
      listeners.delete(onChange);
    };
  }, [key]);

  return key ? (cache.get(key) ?? null) : null;
}
