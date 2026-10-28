import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { can, isStaff, type Permission } from "@/lib/auth/permissions";
import { resolveTimeZone, weekdayName } from "@/lib/timeZone";
import type { AdminActor } from "@/lib/adminImport/pipeline";

/**
 * Guarda das páginas Admin (Fase 9): quem não tem a permissão da área recebe 404 (a área não existe para essa pessoa).
 * `catalog` (administrador e curador), `moderation` (administrador e moderador), `admin` (só administrador);
 * `staff` = qualquer papel da equipe (a casca da área).
 */
export async function requireAdminPage(permission: Permission | "staff" = "admin"): Promise<{ actor: AdminActor; name: string; timeZone: string; role: string }> {
  const user = await getCurrentUser();
  // Senha provisória ainda não trocada: a área não abre (nem para administrador).
  if (!user || user.mustChangePassword || (permission === "staff" ? !isStaff(user.role) : !can(user.role, permission))) notFound();
  return { actor: { id: user.id, name: user.displayName }, name: user.displayName, timeZone: resolveTimeZone(user.timeZone), role: user.role };
}

const pad = (n: number) => String(n).padStart(2, "0");

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const map: Record<string, string> = {};
  for (const p of f.formatToParts(date)) map[p.type] = p.value;
  return map;
}

/** "10:32" no fuso dado. */
export function fmtClock(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "10/10 · 10:32". */
export function fmtDayClock(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.day}/${p.month} · ${p.hour}:${p.minute}`;
}

/** "10/10/2026 · 10:32". */
export function fmtFull(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

/** "10/10/2026". */
export function fmtDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}

/** "Sábado · 13:00 local". */
export function fmtWeekdayClock(date: Date, timeZone: string): string {
  return `${weekdayName(date, timeZone)} · ${fmtClock(date, timeZone)} local`;
}

/** Valor para `<input type="datetime-local">` no fuso dado (`YYYY-MM-DDTHH:mm`). */
export function toLocalInput(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function jobLabel(seq: number): string {
  return `#${seq}`;
}

export { pad };
