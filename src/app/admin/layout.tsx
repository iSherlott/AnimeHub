import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { requireAdminPage } from "@/lib/adminPage";

/** Toda a área /admin: só administradores (os demais recebem 404) e a casca com a barra lateral do Figma. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { name, timeZone } = await requireAdminPage();
  return (
    <AdminFrame adminName={name} timeZone={timeZone}>
      {children}
    </AdminFrame>
  );
}
