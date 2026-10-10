"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ConfirmDialog } from "@/components/StatePanels";

/**
 * Ações do "Resultado da importação" (Figma `8:4020`): resolver pendências,
 * CONFIRMAR IMPORTAÇÃO (só com zero pendências; autorização explícita num
 * diálogo, nunca por clique solto) e voltar ao HTML. O commit mostra
 * "Confirmando…", impede duplo envio e só fecha após o sucesso.
 */
export function ImportResultActions({
  seq,
  state,
  blocking,
  firstPendingHref,
  subject,
}: {
  seq: number;
  state: string;
  blocking: number;
  firstPendingHref: string | null;
  subject: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"commit" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = state === "RUNNING";

  async function run(kind: "commit" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imports/${seq}/${kind}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível concluir. Tente novamente.");
        return;
      }
      setDialog(null);
      router.push(kind === "commit" ? `/admin/jobs/${seq}` : "/admin/importacoes");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {open && blocking > 0 && firstPendingHref && (
          <Button component={NextLink} href={firstPendingHref} variant="contained" startIcon={<CompareArrowsOutlinedIcon />}>
            Resolver {blocking} {blocking === 1 ? "pendência" : "pendências"}
          </Button>
        )}
        {open && (
          <Button
            variant={blocking === 0 ? "contained" : "outlined"}
            disabled={blocking > 0}
            onClick={() => {
              setError(null);
              setDialog("commit");
            }}
            data-testid="confirm-import"
            sx={{ textTransform: "uppercase", ...(blocking > 0 ? { bgcolor: "#171820", borderColor: "transparent", color: "text.secondary" } : {}) }}
          >
            Confirmar importação
          </Button>
        )}
        <Button component={NextLink} href={`/admin/importacoes?from=${seq}`} sx={ELEVATED_BUTTON_SX}>
          Voltar ao HTML
        </Button>
        {open && (
          <Button
            onClick={() => {
              setError(null);
              setDialog("cancel");
            }}
            sx={ELEVATED_BUTTON_SX}
            data-testid="cancel-import"
          >
            Cancelar importação
          </Button>
        )}
      </Box>
      {open && blocking > 0 && (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Ao resolver as {blocking} {blocking === 1 ? "pendência" : "pendências"}, o commit fica disponível. Confirmação explícita é necessária antes de criar o job de commit.
        </Typography>
      )}

      <ConfirmDialog
        open={dialog === "commit"}
        title="Confirmar importação?"
        subject={subject}
        effect="Autoriza Commit e cria o job de aplicação. Somente após sucesso serão preparados broadcast e notificações. A origem e as decisões ficam auditáveis."
        confirmLabel="Confirmar importação"
        busyLabel="Confirmando…"
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run("commit")}
        confirmTestId="confirm-import-dialog"
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        title="Cancelar importação?"
        subject={subject}
        effect="A prévia é descartada e nada é aplicado ao catálogo. O HTML continua disponível no job para uma nova análise."
        confirmLabel="Cancelar importação"
        busyLabel="Cancelando…"
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run("cancel")}
        confirmTestId="cancel-import-dialog"
      />
    </Box>
  );
}
