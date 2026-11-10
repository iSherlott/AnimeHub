"use client";

/** Partes da Minha Lista (botões de espera e de término, chip, título): saíram do MyListView para ele ficar menor. */
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX, lineLang, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { WorkPreviewTrigger } from "@/components/WorkPreview";
import type { MyListEntry } from "@/lib/myList";

/**
 * "Espera": põe a obra em modo de espera (ou a retoma). Em espera ela continua na lista e no perfil, mas é uma obra que
 * a pessoa não vai acompanhar no lançamento (já viu alguns episódios) — sai do calendário "Minha Lista", dos alertas
 * e de "Para assistir". Sem confirmação: é reversível com o mesmo botão.
 */
export function WaitButton({ entry }: { entry: MyListEntry }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${entry.id}/waiting`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waiting: !entry.waiting }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Button
        onClick={() => void toggle()}
        disabled={busy}
        startIcon={entry.waiting ? <PauseCircleIcon /> : <PauseCircleOutlineIcon />}
        aria-pressed={entry.waiting}
        title={entry.waiting ? "Em espera — clique para voltar a acompanhar" : "Pôr em espera: não vou acompanhar no lançamento"}
        data-testid="wait-toggle"
        sx={{ ...ELEVATED_BUTTON_SX, ...(entry.waiting ? { color: "warning.main", border: 1, borderColor: "warning.main" } : {}) }}
      >
        Espera
      </Button>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Obra que já terminou de ser exibida: em vez de "Espera", a pessoa diz em que pé está — "Terminei" (já vi tudo) ou
 * "Não terminei" (fica em espera, fora da agenda e dos alertas). Os mesmos nomes do andamento no resto do site (álbuns
 * do perfil). Clicar de novo desfaz.
 */
export function FinishedChoice({ entry }: { entry: MyListEntry }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = entry.watchState === "FINISHED";
  const pending = entry.watchState === "UNFINISHED" || entry.waiting;

  async function choose(kind: "FINISHED" | "PENDING") {
    setBusy(true);
    setError(null);
    const on = kind === "FINISHED" ? finished : pending;
    const body = kind === "FINISHED" ? { state: on ? null : "FINISHED", waiting: false } : { state: on ? null : "UNFINISHED", waiting: !on };
    try {
      const res = await fetch(`/api/anime/${entry.id}/watch-state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Box role="group" aria-label="Andamento da obra finalizada" sx={{ display: "inline-flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          onClick={() => void choose("FINISHED")}
          disabled={busy}
          startIcon={<CheckCircleIcon />}
          aria-pressed={finished}
          title="Já vi tudo"
          data-testid={`finished-done-${entry.anilistId ?? entry.id}`}
          sx={{ ...ELEVATED_BUTTON_SX, ...(finished ? { color: "success.main", border: 1, borderColor: "success.main" } : {}) }}
        >
          Terminei
        </Button>
        <Button
          onClick={() => void choose("PENDING")}
          disabled={busy}
          startIcon={pending ? <PauseCircleIcon /> : <PauseCircleOutlineIcon />}
          aria-pressed={pending}
          title="Ainda não terminei: fica em espera"
          data-testid={`finished-pending-${entry.anilistId ?? entry.id}`}
          sx={{ ...ELEVATED_BUTTON_SX, ...(pending ? { color: "warning.main", border: 1, borderColor: "warning.main" } : {}) }}
        >
          Não terminei
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** O controle certo para cada obra: terminada = Terminei/Não terminei; no ar ou por estrear = Espera. Obra com várias temporadas conta como uma só. */
export function EntryAction({ entry }: { entry: MyListEntry }) {
  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.75, alignItems: "flex-start" }}>
      {entry.seasonsCount > 1 && (
        <Typography data-testid={`seasons-count-${entry.anilistId ?? entry.id}`} sx={{ fontSize: 12, color: "text.secondary" }}>
          {entry.seasonsCount} temporadas
        </Typography>
      )}
      {entry.status === "FINISHED" ? <FinishedChoice entry={entry} /> : <WaitButton entry={entry} />}
    </Box>
  );
}

export function Chip({ tone = "neutral", icon, children }: { tone?: "neutral" | "warning"; icon: ReactNode; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        alignSelf: "flex-start",
        px: 1,
        py: 0.75,
        borderRadius: "6px",
        bgcolor: "#171820",
        color: tone === "warning" ? "warning.main" : "text.secondary",
        "& svg": { fontSize: 14 },
      }}
    >
      {icon}
      <Typography suppressHydrationWarning component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit" }}>
        {children}
      </Typography>
    </Box>
  );
}

export const panelSx = {
  display: "flex",
  flexDirection: "column",
  gap: 2.5,
  p: 3,
  borderRadius: "16px",
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  minWidth: 0,
} as const;

/** Título (nativo em destaque) + apoio; tocar no título abre a prévia, com o botão do detalhe pessoal. */
export function EntryTitle({ entry, size = 20 }: { entry: MyListEntry; size?: number }) {
  const titleLines = useTitleLines(entry);
  const { secondary, primaryLang } = titleLines;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
      <Typography lang={primaryLang} sx={{ fontSize: size, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
        <WorkPreviewTrigger
          inline
          label={titleLines.primary}
          info={{ titles: entry, coverImage: entry.coverImage, href: `/anime/${entry.id}`, anilistId: entry.anilistId, meta: [entry.seasonsCount > 1 ? `${entry.seasonsCount} temporadas` : null] }}
          sx={{ display: "inline", width: "auto", font: "inherit", "&:hover": { textDecoration: "underline" } }}
        >
          <PrimaryTitle lines={titleLines} />
        </WorkPreviewTrigger>
      </Typography>
      {secondary.map((line) => (
        <Typography key={line} lang={lineLang(line)} sx={{ fontSize: 13, color: "text.secondary" }}>
          {line}
        </Typography>
      ))}
    </Box>
  );
}
