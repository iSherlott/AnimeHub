"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` no HTML do servidor e enquanto o React assume a página; `true` depois. Para campos que já chegam desenhados
 * no HTML mas só respondem depois disso: desativados até lá, o que a pessoa digita ou escolhe não se perde.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
