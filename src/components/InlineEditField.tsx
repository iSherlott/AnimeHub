"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button, Stack, Typography } from "@mui/material";

/**
 * Casca compartilhada do padrão "link de texto → formulário inline com
 * Salvar/cancelar" usado por AnidbIdEditor/SeriesGroupEditor/TitleEditor —
 * cada um só fornece os próprios campos (via children) e a lógica de save.
 *
 * Dono do `router.refresh()` pós-salvamento (cada editor só faz o
 * `fetch`) — antes, cada editor chamava `router.refresh()` e fechava o
 * formulário na sequência; `router.refresh()` só AGENDA a nova busca dos
 * dados do servidor, não espera ela terminar de aplicar na árvore, então
 * o formulário fechava (dando a impressão de "já salvou") antes da tela
 * de fato refletir o valor novo (achado real da 25ª rodada de auditoria,
 * Epic 18). Agora o refresh roda dentro de `startTransition` e só fecha
 * quando `isPending` volta a `false` — só aí a UI garantidamente já tem
 * o dado atualizado.
 */
export function InlineEditField({
  triggerLabel,
  onSave,
  onCancel,
  extraContent,
  children,
}: {
  triggerLabel: string;
  /** Deve rejeitar (throw) em caso de validação ou falha de servidor — só
   * assim o formulário fica aberto mostrando o erro em vez de fechar como
   * se tivesse salvo (achado real da 5ª rodada de auditoria, Epic 18: o
   * ID da AniDB inválido era descartado em silêncio, sem nenhum aviso).
   * Não precisa (e não deve) chamar `router.refresh()` — quem cuida disso
   * agora é este componente, depois que `onSave` resolve com sucesso. */
  onSave: () => Promise<void>;
  /** Restaura o(s) campo(s) do editor pro último valor salvo — sem isso,
   * "cancelar" só fechava o formulário e deixava o rascunho não salvo lá
   * dentro; reabrir mostrava o rascunho cancelado, não o valor real, com
   * risco real de sobrescrever o valor certo num "Salvar" futuro sem
   * querer (achado real da 5ª rodada de auditoria, Epic 18). */
  onCancel: () => void;
  extraContent?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingClose, setAwaitingClose] = useState(false);
  const [isRefreshPending, startRefreshTransition] = useTransition();

  // Só fecha depois que a transição do refresh realmente assentou — ver
  // comentário da função acima. Setar estado durante o render (não num
  // `useEffect`) é o padrão que o React recomenda pra "reagir a uma
  // mudança de outro estado" (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — guardado pela comparação com `prevRefreshPending`, senão viraria
  // loop. `awaitingClose` existe pra distinguir "ainda não iniciei o
  // refresh" de "refresh terminou": checar só `!isRefreshPending` sem
  // essa flag fecharia cedo demais, porque ele também começa `false`
  // ANTES de `startRefreshTransition` ser chamado.
  const [prevRefreshPending, setPrevRefreshPending] = useState(isRefreshPending);
  if (isRefreshPending !== prevRefreshPending) {
    setPrevRefreshPending(isRefreshPending);
    if (awaitingClose && !isRefreshPending) {
      setOpen(false);
      setSaving(false);
      setAwaitingClose(false);
    }
  }

  // Cinto de segurança: se o refresh nunca assentar de verdade (rede caiu
  // bem nesse meio-tempo, por exemplo), a checagem acima nunca dispara e a
  // pessoa fica travada olhando "..." pra sempre — o salvamento em si já
  // tinha sido confirmado pelo servidor antes de chegar aqui (`onSave()`
  // só chega até aqui se não lançou), então não vale a pena travar a UI
  // por causa só do refresh não ter aplicado.
  useEffect(() => {
    if (!awaitingClose) return;
    const timeout = setTimeout(() => {
      setOpen(false);
      setSaving(false);
      setAwaitingClose(false);
    }, 8000);
    return () => clearTimeout(timeout);
  }, [awaitingClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
      setSaving(false);
      return;
    }
    startRefreshTransition(() => {
      router.refresh();
    });
    setAwaitingClose(true);
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="small"
        sx={{
          justifyContent: "flex-start",
          px: 0,
          minWidth: 0,
          fontSize: 12,
          fontWeight: 400,
          textTransform: "none",
          color: "text.secondary",
          "&:hover": { textDecoration: "underline", bgcolor: "transparent" },
        }}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", alignItems: "center", border: 1, borderColor: "divider", bgcolor: "background.paper", p: 1 }}
    >
      {children}
      {extraContent}
      <Button onClick={handleSave} disabled={saving} size="small" variant="outlined">
        {saving ? "..." : "Salvar"}
      </Button>
      <Button
        onClick={() => {
          setError(null);
          onCancel();
          setOpen(false);
        }}
        disabled={saving}
        size="small"
        color="inherit"
      >
        cancelar
      </Button>
      {error && (
        <Typography variant="caption" color="error" sx={{ width: "100%" }}>
          {error}
        </Typography>
      )}
    </Stack>
  );
}
