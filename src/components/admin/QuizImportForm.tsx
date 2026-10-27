"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ErrorNotice, Notice } from "@/components/StatePanels";

const EXAMPLE = `{
  "anilistId": 154587,
  "scope": "Season 1 — personagens e ambientação",
  "titleReward": "Olhar de boticária",
  "questions": [
    { "category": "PERSONAGENS", "text": "Qual é o nome da jovem boticária?", "options": ["Maomao", "Gyokuyou", "Lihua", "Xiaolan"], "correct": "A" }
  ]
}`;

type Outcome = { anilistId: number | null; work: string; action: "created" | "replaced"; approved: boolean };
type Preview = { anilistId: number | null; work: string; scope: string; titleReward: string; questions: number };

const fieldSx = { p: 1.5, bgcolor: "background.paper", color: "text.primary", border: 1, borderColor: "divider", borderRadius: "10px", fontSize: 14, fontFamily: "inherit", "&:focus": { outline: "none", borderColor: "text.secondary" }, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 } };

/**
 * Carga de perguntas (Admin → Quizzes): cole o JSON (um quiz ou uma lista, vários animes de uma vez) ou um CSV `;`
 * de um único anime. "Validar" só confere; "Carregar" grava tudo ou nada. Por padrão as perguntas entram para
 * revisão — o quiz só fica disponível com as 10 aprovadas.
 */
export function QuizImportForm() {
  const router = useRouter();
  const textId = useId();
  const [text, setText] = useState("");
  const [anilistId, setAnilistId] = useState("");
  const [scope, setScope] = useState("");
  const [titleReward, setTitleReward] = useState("");
  const [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState<"validate" | "load" | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(dryRun: boolean) {
    setBusy(dryRun ? "validate" : "load");
    setErrors(null);
    setPreview(null);
    setOutcomes(null);
    setFailure(null);
    try {
      const res = await fetch("/api/admin/quizzes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, work: anilistId.trim() || undefined, scope: scope.trim() || undefined, titleReward: titleReward.trim() || undefined, approve, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.errors)) setErrors(data.errors as string[]);
        else setFailure(data.error ?? "Falha ao processar a carga.");
        return;
      }
      if (dryRun) setPreview(data.quizzes as Preview[]);
      else {
        setOutcomes(data.outcomes as Outcome[]);
        setText("");
        router.refresh();
      }
    } catch {
      setFailure("Não foi possível falar com o servidor. O texto foi mantido; tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Box component="form" onSubmit={(e) => e.preventDefault()} noValidate sx={{ display: "flex", flexDirection: "column", gap: 3 }} data-testid="quiz-import-form">
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography component="label" htmlFor={`${textId}-id`} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            AniList id (CSV)
          </Typography>
          <Box component="input" id={`${textId}-id`} value={anilistId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnilistId(e.target.value)} placeholder="só para CSV: 154587 ou anidb-18290" sx={{ ...fieldSx, width: 230 }} />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: "1 1 260px" }}>
          <Typography component="label" htmlFor={`${textId}-scope`} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            Escopo (CSV)
          </Typography>
          <Box component="input" id={`${textId}-scope`} value={scope} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScope(e.target.value)} placeholder="Season 1 — personagens e ambientação" sx={fieldSx} />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: "1 1 220px" }}>
          <Typography component="label" htmlFor={`${textId}-title`} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            Título da recompensa (CSV)
          </Typography>
          <Box component="input" id={`${textId}-title`} value={titleReward} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitleReward(e.target.value)} placeholder="Olhar de boticária" sx={fieldSx} />
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="label" htmlFor={textId} sx={{ fontSize: 14 }}>
          Perguntas (JSON ou CSV)
        </Typography>
        <Box
          component="textarea"
          id={textId}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          sx={{ ...fieldSx, minHeight: 280, p: 3, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.6, borderRadius: "12px" }}
        />
      </Box>

      <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1.5, fontSize: 14 }}>
        <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} data-testid="quiz-import-approve" />
        Já aprovar as perguntas ao carregar (só se a revisão editorial já foi feita)
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Button onClick={() => void submit(true)} disabled={busy !== null} sx={ELEVATED_BUTTON_SX} data-testid="quiz-import-validate">
          {busy === "validate" ? "Validando…" : "Validar"}
        </Button>
        <Button variant="contained" startIcon={<FileUploadOutlinedIcon />} onClick={() => void submit(false)} disabled={busy !== null} data-testid="quiz-import-load" sx={{ textTransform: "uppercase" }}>
          {busy === "load" ? "Carregando…" : "Carregar"}
        </Button>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Tudo ou nada: se algo estiver errado, nada é gravado.</Typography>
      </Box>

      {errors && (
        <ErrorNotice title={`A carga não foi gravada (${errors.length} ${errors.length === 1 ? "problema" : "problemas"})`} testId="quiz-import-errors">
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </Box>
        </ErrorNotice>
      )}
      {failure && <ErrorNotice title="Falha na carga" testId="quiz-import-failure">{failure}</ErrorNotice>}
      {preview && (
        <Notice tone="info" title="Validação concluída — nada foi gravado ainda" testId="quiz-import-preview">
          {preview.map((q) => `Obra #${q.work} · ${q.titleReward} · ${q.questions} perguntas · ${q.scope}`).join(" | ")}
        </Notice>
      )}
      {outcomes && (
        <Notice tone="success" title="Carga gravada" testId="quiz-import-done">
          {outcomes.map((o) => `Obra #${o.work}: ${o.action === "created" ? "quiz criado" : "perguntas substituídas"} (${o.approved ? "aprovadas" : "aguardando revisão"})`).join(" | ")}
        </Notice>
      )}
    </Box>
  );
}
