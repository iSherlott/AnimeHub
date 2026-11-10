"use client";

import { Box } from "@mui/material";
import { AdminExtraReports } from "@/components/AdminExtraReports";
import { AdminDataPanel } from "@/components/AdminDataPanel";
import { AdminReportQueues } from "@/components/admin/AdminReportQueues";
import { AdminAccounts } from "@/components/admin/AdminAccounts";

/**
 * `canManageUsers` (Fase 9): só o administrador cria contas e vê usuários, papéis e as execuções dos serviços; o moderador
 * vê as denúncias. O servidor confere de novo em cada API. Sistema fechado: não existe cadastro aberto — toda conta nasce
 * aqui, como membro. Cada parte carrega os próprios dados (denúncias, dados e contas), em componentes separados.
 */
export function AdminDashboard({ canManageUsers = true, currentUserId }: { canManageUsers?: boolean; currentUserId?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <AdminReportQueues />
      <AdminExtraReports />
      {canManageUsers && <AdminDataPanel />}
      {canManageUsers && <AdminAccounts currentUserId={currentUserId} />}
    </Box>
  );
}
