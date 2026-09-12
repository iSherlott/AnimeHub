"use client";

import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/auth/session";

/** `undefined` enquanto carrega, `null` se não estiver logado. */
export function useCurrentUser(): PublicUser | null | undefined {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
