"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import { Box, Button, Typography } from "@mui/material";
import { SelectField } from "@/components/FilterField";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ErrorNotice } from "@/components/StatePanels";
import { ImportProgress } from "@/components/admin/ImportProgress";
import { detectSeason, detectYearFromTitles, PARSER_VERSION } from "@/lib/adminImport/parseSeasonHtml";
import { parseSeasonSlug, SEASON_COPY } from "@/lib/exploreGroups";

/**
 * Formulário "Importar temporada" (Figma `8:3894`): fonte + temporada + HTML
 * colado. ANALISAR só prepara a prévia (não faz commit); HTML vazio bloqueia
 * com a mensagem junto ao campo; uma falha preserva o HTML e oferece nova
 * tentativa. Sem autosave.
 */
export function ImportForm({ seasons, initialHtml = "", initialSeason }: { seasons: string[]; initialHtml?: string; initialSeason?: string }) {
  const router = useRouter();
  const htmlId = useId();
  const [source, setSource] = useState("AniDB");
  const [season, setSeason] = useState(initialSeason && seasons.includes(initialSeason) ? initialSeason : seasons[0]);
  const [html, setHtml] = useState(initialHtml);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ error: string; seq?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [detected, setDetected] = useState<string | null>(null);

  /** O HTML do AniDB não traz a temporada: pelas datas, escolhe a mais recente que bate (e avisa), para não errar o rótulo. */
  function changeHtml(next: string) {
    setHtml(next);
    const found = next.length > 2000 ? detectSeason(next) : null;
    const year = next.length > 2000 ? detectYearFromTitles(next) : null;
    // O ano vem dos títulos ("Nome (2025)"), quando há; senão vale a temporada mais recente com esse nome.
    const option = found
      ? (year ? seasons.find((s) => { const ref = parseSeasonSlug(s.toLowerCase()); return ref?.season === found && ref.year === year; }) : undefined) ?? seasons.find((s) => parseSeasonSlug(s.toLowerCase())?.season === found)
      : undefined;
    if (option) setSeason(option);
    setDetected(option && found ? `${SEASON_COPY[found].labelPt} (${option})` : null);
  }

  async function analyze() {
    setFailure(null);
    if (!html.trim()) {
      setFieldError("Cole o HTML da temporada para analisar.");
      document.getElementById(htmlId)?.focus();
      return;
    }
    setFieldError(null);
    setStartedAt(Date.now());
    setBusy(true);
    try {
      const res = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, source, season }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if ((data.field === "html" || data.field === "season") && !data.seq) setFieldError(data.error);
        else setFailure({ error: data.error ?? "Falha ao processar importação.", seq: data.seq });
        return;
      }
      router.push(`/admin/importacoes/${data.seq}`);
    } catch {
      setFailure({ error: "Não foi possível falar com o servidor. O HTML foi mantido; tente novamente." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); void analyze(); }} sx={{ display: "flex", flexDirection: "column", gap: 3 }} noValidate>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        <SelectField label="Fonte" value={source} onChange={setSource} width={300} options={[{ value: "AniDB", label: "AniDB" }]} />
        <SelectField label="Temporada" value={season} onChange={setSeason} width={300} options={seasons.map((s) => ({ value: s, label: s }))} />
        <SelectField label="Parser" value="auto" onChange={() => undefined} width={300} options={[{ value: "auto", label: `${PARSER_VERSION} · selecionado pela fonte` }]} />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="label" htmlFor={htmlId} sx={{ fontSize: 14 }}>
          HTML da temporada
        </Typography>
        <Box
          component="textarea"
          id={htmlId}
          value={html}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => changeHtml(e.target.value)}
          placeholder="Cole aqui o HTML completo da listagem de temporada..."
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${htmlId}-error` : undefined}
          spellCheck={false}
          sx={{
            minHeight: 320,
            p: 3,
            resize: "vertical",
            bgcolor: "background.paper",
            color: "text.primary",
            border: 1,
            borderColor: fieldError ? "primary.main" : "divider",
            borderRadius: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 14,
            lineHeight: 1.6,
            "&:focus": { outline: "none", borderColor: "text.secondary" },
          }}
        />
        {detected && (
          <Typography data-testid="season-detected" sx={{ fontSize: 13, color: "text.secondary" }}>
            Temporada detectada pelas datas do HTML: {detected}. Confira antes de analisar.
          </Typography>
        )}
        {fieldError && (
          <Typography id={`${htmlId}-error`} role="alert" sx={{ fontSize: 13, color: "primary.main" }}>
            {fieldError}
          </Typography>
        )}
      </Box>

      <ImportProgress running={busy} since={startedAt} fallbackNote="Enviando o HTML e preparando a análise…" />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Button type="submit" variant="contained" loading={busy} startIcon={<DocumentScannerOutlinedIcon />} sx={{ textTransform: "uppercase" }}>
          Analisar
        </Button>
        <Button
          onClick={() => {
            setHtml("");
            setDetected(null);
            setFieldError(null);
            setFailure(null);
          }}
          disabled={busy}
          sx={ELEVATED_BUTTON_SX}
        >
          Limpar HTML
        </Button>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Analisar prepara a prévia. Não faz commit.</Typography>
      </Box>

      {failure && (
        <ErrorNotice title="Falha ao processar importação." onRetry={() => void analyze()} testId="import-failure">
          {failure.error} O HTML permanece disponível para revisão ou nova tentativa.{" "}
          {failure.seq && (
            <NextLink href={`/admin/jobs/${failure.seq}`} style={{ color: "inherit" }}>
              Ver job #{failure.seq}
            </NextLink>
          )}
        </ErrorNotice>
      )}
    </Box>
  );
}
