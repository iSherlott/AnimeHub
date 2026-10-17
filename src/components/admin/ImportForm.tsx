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
import { parseSeasonSlug, SEASON_COPY, seasonLabel, type SeasonName } from "@/lib/exploreGroups";

const SEASON_ORDER: SeasonName[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const MIN_YEAR = 1960;
const MAX_YEAR = 2100;

/** Da mais nova para a mais antiga; rótulo que não se entende vai para o fim. */
function sortSeasons(labels: string[]): string[] {
  const rank = (label: string) => {
    const ref = parseSeasonSlug(label.toLowerCase());
    return ref ? ref.year * 4 + SEASON_ORDER.indexOf(ref.season) : -1;
  };
  return Array.from(new Set(labels)).sort((a, b) => rank(b) - rank(a));
}

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
  // A lista de temporadas é dinâmica: as recentes e qualquer outra que o HTML (ou o admin) peça — não precisa existir antes.
  const [options, setOptions] = useState<string[]>(() => sortSeasons(initialSeason ? [...seasons, initialSeason] : seasons));
  const [season, setSeason] = useState(initialSeason && parseSeasonSlug(initialSeason.toLowerCase()) ? initialSeason : seasons[0]);
  const [customSeason, setCustomSeason] = useState<SeasonName>("FALL");
  const [customYear, setCustomYear] = useState("");
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
    // O ano vem dos títulos ("Nome (2023)"), quando há — e a temporada é criada na lista se ainda não existir; sem ano nos
    // títulos, vale a temporada mais recente com esse nome.
    const option = found ? (year ? seasonLabel({ season: found, year }) : options.find((s) => parseSeasonSlug(s.toLowerCase())?.season === found)) : undefined;
    if (option) {
      setOptions((prev) => (prev.includes(option) ? prev : sortSeasons([...prev, option])));
      setSeason(option);
    }
    setDetected(option && found ? `${SEASON_COPY[found].labelPt} (${option})` : null);
  }

  /** Temporada à escolha do admin (qualquer ano): entra na lista e já fica selecionada. */
  const customYearNumber = Number(customYear);
  const customValid = Number.isInteger(customYearNumber) && customYearNumber >= MIN_YEAR && customYearNumber <= MAX_YEAR;
  function addCustomSeason() {
    if (!customValid) return;
    const label = seasonLabel({ season: customSeason, year: customYearNumber });
    setOptions((prev) => (prev.includes(label) ? prev : sortSeasons([...prev, label])));
    setSeason(label);
    setCustomYear("");
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
        <SelectField label="Temporada" value={season} onChange={setSeason} width={300} options={options.map((s) => ({ value: s, label: s }))} testId="import-season" />
        <SelectField label="Parser" value="auto" onChange={() => undefined} width={300} options={[{ value: "auto", label: `${PARSER_VERSION} · selecionado pela fonte` }]} />
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 2 }} data-testid="custom-season">
        <SelectField
          label="Outra temporada"
          value={customSeason}
          onChange={(v) => setCustomSeason(v as SeasonName)}
          width={200}
          options={SEASON_ORDER.map((s) => ({ value: s, label: SEASON_COPY[s].labelPt }))}
        />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: 140 }}>
          <Typography component="label" htmlFor={`${htmlId}-year`} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            Ano
          </Typography>
          <Box
            component="input"
            id={`${htmlId}-year`}
            type="number"
            inputMode="numeric"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={customYear}
            placeholder="2023"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomYear(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSeason();
              }
            }}
            sx={{ p: 2, bgcolor: "background.paper", color: "text.primary", border: 1, borderColor: "divider", borderRadius: "10px", fontSize: 14, "&:focus": { outline: "none", borderColor: "text.secondary" } }}
          />
        </Box>
        <Button onClick={addCustomSeason} disabled={!customValid} sx={ELEVATED_BUTTON_SX} data-testid="add-custom-season">
          Usar esta temporada
        </Button>
        <Typography sx={{ fontSize: 13, color: "text.secondary", flex: "1 1 240px" }}>
          Qualquer ano vale (a lista se completa sozinha ao colar o HTML). Se a temporada não existir na AniList ainda, ela é criada ao analisar.
        </Typography>
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
