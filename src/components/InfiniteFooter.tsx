"use client";

import type { Ref } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";

/**
 * Rodapé de uma lista com rolagem infinita: o sentinela que pede a próxima página antes de ela chegar à tela, o aviso de
 * "carregando", o botão de reserva (navegador sem IntersectionObserver), o erro com "Tentar de novo" e o fim da lista.
 * `testId` prefixa os ids de teste (`<testId>-sentinel`, `-loading`, `-more`, `-end`, `-error`).
 */
export function InfiniteFooter({
  sentinelRef,
  supported,
  hasMore,
  loadingMore,
  failed,
  onMore,
  onRetry,
  loadingLabel = "Carregando mais…",
  moreLabel = "Ver mais",
  endLabel,
  testId = "infinite",
}: {
  sentinelRef: Ref<HTMLElement>;
  supported: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  failed: boolean;
  onMore: () => void;
  onRetry: () => void;
  loadingLabel?: string;
  moreLabel?: string;
  /** Texto de "chegou ao fim"; sem ele, o fim da lista não mostra nada. */
  endLabel?: string;
  testId?: string;
}) {
  return (
    <Box data-testid={`${testId}-footer`} sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, mt: 3 }}>
      {hasMore && <Box ref={sentinelRef as Ref<HTMLDivElement>} data-testid={`${testId}-sentinel`} aria-hidden sx={{ height: 1, width: "100%" }} />}
      {loadingMore && (
        <Typography role="status" data-testid={`${testId}-loading`} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 14, color: "text.secondary" }}>
          <CircularProgress size={16} aria-hidden /> {loadingLabel}
        </Typography>
      )}
      {hasMore && !supported && !failed && (
        <Button onClick={onMore} disabled={loadingMore} data-testid={`${testId}-more`} sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
          {moreLabel}
        </Button>
      )}
      {!hasMore && !failed && endLabel && (
        <Typography data-testid={`${testId}-end`} sx={{ fontSize: 13, color: "text.secondary", textAlign: "center" }}>
          {endLabel}
        </Typography>
      )}
      {failed && (
        <Alert
          severity="error"
          data-testid={`${testId}-error`}
          sx={{ width: "100%" }}
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar mais agora. Isso não quer dizer que a lista acabou.
        </Alert>
      )}
    </Box>
  );
}
