"use client";

import { useEffect } from "react";
import { rememberRecentWork } from "@/lib/recentWorks";

/** Não desenha nada: só anota no navegador que esta obra foi aberta. */
export function RecentWorkTracker({ anilistId }: { anilistId: number }) {
  useEffect(() => {
    rememberRecentWork(anilistId);
  }, [anilistId]);
  return null;
}
