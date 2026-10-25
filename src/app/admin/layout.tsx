import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { requireAdminPage } from "@/lib/adminPage";

/**
 * Toda a área /admin: só a equipe (os demais recebem 404) e a casca com a barra lateral do Figma. Cada página confere a
 * permissão da própria área (Fase 9), e o menu mostra só o que o papel pode abrir.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { name, timeZone, role } = await requireAdminPage("staff");
  return (
    <AdminFrame adminName={name} timeZone={timeZone} role={role}>
      {children}
    </AdminFrame>
  );
}
