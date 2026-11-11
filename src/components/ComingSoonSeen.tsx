"use client";

import { useEffect } from "react";

/** A tela "Em breve" marca os anúncios como lidos no servidor; este evento avisa o sino do cabeçalho na hora. */
export const ANNOUNCEMENTS_SEEN_EVENT = "animehub:announcements-seen";
export type AnnouncementsSeenDetail = { at: string };

export function ComingSoonSeen({ at }: { at: string }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<AnnouncementsSeenDetail>(ANNOUNCEMENTS_SEEN_EVENT, { detail: { at } }));
  }, [at]);
  return null;
}
