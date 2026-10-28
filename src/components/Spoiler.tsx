"use client";

import { useState, type ReactNode } from "react";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Box, Button, ButtonBase, Typography } from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { splitSpoilers } from "@/lib/spoilers";

/** Preferência da pessoa (Configurações → Spoilers): mostrar direto, sem perguntar. Sem conta ou sem escolha: pergunta. */
export function useShowSpoilers(): boolean {
  return Boolean(useCurrentUser()?.preferences?.showSpoilers);
}

/** A marca discreta que acompanha um spoiler já à mostra ("⚠ Spoiler de Frieren · até o episódio 18"). */
export function SpoilerMark({ label }: { label: string }) {
  return (
    <Box component="span" data-testid="spoiler-mark" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 12, fontWeight: 700, color: "warning.main" }}>
      <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
      {label}
    </Box>
  );
}

/**
 * Um trecho de spoiler dentro do texto (`||assim||`): coberto por uma tarja até a pessoa tocar (ou já à mostra, com
 * sublinhado tracejado, para quem escolheu mostrar spoilers direto). O conteúdo fica fora da leitura de tela enquanto
 * coberto: o botão diz só "Spoiler de …: toque para ver".
 */
export function InlineSpoiler({ label, children }: { label: string; children: ReactNode }) {
  const auto = useShowSpoilers();
  const [open, setOpen] = useState(false);
  if (open || auto) {
    return (
      <Box component="span" title={label} data-spoiler="shown" sx={{ borderBottom: "1px dashed", borderColor: "warning.main", bgcolor: "rgba(255,183,77,0.08)", borderRadius: "3px", px: 0.25 }}>
        {children}
      </Box>
    );
  }
  return (
    <ButtonBase
      component="span"
      role="button"
      tabIndex={0}
      data-spoiler="hidden"
      aria-label={`${label}: toque para ver`}
      title={`${label} — toque para ver`}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
      sx={{ display: "inline", font: "inherit", lineHeight: "inherit", verticalAlign: "baseline", color: "transparent", bgcolor: "#30313e", borderRadius: "4px", px: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "#3a3b4a" }, "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 1 } }}
    >
      <span aria-hidden>{children}</span>
    </ButtonBase>
  );
}

/** Texto com os trechos `||…||` cobertos. `renderText` desenha os trechos comuns (links, hashtags…). */
export function SpoilerRichText({ text, label, renderText }: { text: string; label: string; renderText?: (value: string, key: number) => ReactNode }) {
  return (
    <>
      {splitSpoilers(text).map((segment, i) =>
        segment.spoiler ? (
          <InlineSpoiler key={i} label={label}>
            {segment.text}
          </InlineSpoiler>
        ) : renderText ? (
          renderText(segment.text, i)
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  );
}

/**
 * Conteúdo inteiro marcado como spoiler, coberto na própria tela (tópicos, respostas, recados, depoimentos, eventos): o
 * aviso diz de qual anime e até onde, e a pessoa escolhe ver. Quem escolheu mostrar spoilers direto já vê, com a marca.
 */
export function SpoilerBlock({ isSpoiler, label, testId, children }: { isSpoiler: boolean; label: string; testId?: string; children: ReactNode }) {
  const auto = useShowSpoilers();
  const [shown, setShown] = useState(false);
  if (!isSpoiler) return <>{children}</>;
  if (!shown && !auto) {
    return (
      <Box
        role="group"
        aria-label={label}
        data-testid={testId ? `${testId}-spoiler` : "spoiler-block"}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1.5, borderRadius: "10px", bgcolor: "#171820", border: 1, borderColor: "divider" }}
      >
        <VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: "warning.main" }} aria-hidden />
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 200px" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{label}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Contém spoiler. Fica coberto até você escolher ver.</Typography>
        </Box>
        <Button size="small" onClick={() => setShown(true)} sx={{ bgcolor: "#23242f", color: "text.primary", "&:hover": { bgcolor: "#2b2c38" } }}>
          Mostrar
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <SpoilerMark label={label} />
      {children}
    </Box>
  );
}
