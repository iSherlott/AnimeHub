"use client";

/** O que /api/notifications devolve (só os campos que as telas leem; o resto segue junto). */
export type NotificationsPayload = { alerts?: unknown[]; social?: unknown[] };

// Pedidos feitos quase juntos (o sino do cabeçalho e o Dashboard, ao abrir a página) dividem a mesma resposta.
const SHARE_MS = 3000;
let inFlight: { at: number; request: Promise<NotificationsPayload | null> } | null = null;

/** Busca os avisos uma vez para quem pedir dentro de poucos segundos; `null` se a busca falhar. */
export function fetchNotifications(): Promise<NotificationsPayload | null> {
  const now = Date.now();
  if (inFlight && now - inFlight.at < SHARE_MS) return inFlight.request;
  const request = fetch("/api/notifications")
    .then((res) => (res.ok ? (res.json() as Promise<NotificationsPayload>) : null))
    .catch(() => null);
  inFlight = { at: now, request };
  return request;
}
