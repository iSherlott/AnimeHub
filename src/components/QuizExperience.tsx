"use client";

import { useCallback, useEffect, useState } from "react";
import NextLink from "next/link";
import EyeOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Box, Button, Typography } from "@mui/material";
import { AchievementTitleBadge } from "@/components/AchievementTitleBadge";
import { CoverImage } from "@/components/CoverImage";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ConfirmDialog } from "@/components/StatePanels";
import { loginHref } from "@/lib/safeRedirect";
import type { QuestionDTO, QuizState } from "@/lib/quiz";

type Work = { titleNative: string | null; titleRomaji: string; titleEnglish: string | null; coverImage: string | null };
type Phase = "intro" | "question" | "result";
type Result = { score: number; perfect: boolean; title: { id: string; name: string } | null };

const TOTAL = 10;
const LETTERS = ["A", "B", "C", "D"] as const;

function Panel({ title, children, testId }: { title?: string; children: React.ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      {title && (
        <Typography component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** Progresso (Figma `QuizProgress`): "Pergunta N de 10" e 10 etapas, a atual e as anteriores em acento. */
function Progress({ step }: { step: number }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="quiz-progress">
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{step === 0 ? `${TOTAL} perguntas · não iniciado` : `Pergunta ${step} de ${TOTAL}`}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Uma resposta por pergunta</Typography>
      </Box>
      <Box role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={step} sx={{ display: "flex", gap: 1 }}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <Box key={i} sx={{ flex: 1, height: 3, bgcolor: i < step ? "primary.main" : "divider" }} />
        ))}
      </Box>
    </Box>
  );
}

function WorkColumn({ work, scope, titleReward }: { work: Work; scope: string; titleReward: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ position: "relative", height: { xs: 280, lg: 400 }, borderRadius: "16px", overflow: "hidden", bgcolor: "#171820" }}>
        {work.coverImage && <CoverImage src={work.coverImage} sizes="320px" />}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {work.titleNative && (
          <Typography lang="ja" sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
            {work.titleNative}
          </Typography>
        )}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{work.titleEnglish ?? work.titleRomaji}</Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>ESCOPO</Typography>
      <Typography sx={{ fontSize: 14 }}>{scope}</Typography>
      <Panel title="Título do quiz">
        <AchievementTitleBadge title={titleReward} />
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Desbloqueio somente com 10/10. A recompensa é cosmética, não um registro de episódios assistidos.
        </Typography>
      </Panel>
    </Box>
  );
}

function ResultPanel({ result, workHref }: { result: Result; workHref: string }) {
  return (
    <Box
      data-testid="quiz-result"
      sx={{ bgcolor: "background.paper", border: 1, borderColor: result.perfect ? "#8b5cf6" : "divider", borderRadius: "16px", p: { xs: 3, md: 5 }, display: "flex", flexDirection: "column", gap: 4 }}
    >
      <Typography data-testid="quiz-score" sx={{ fontSize: { xs: 56, md: 80 }, lineHeight: 1 }}>
        {result.score}/{TOTAL}
      </Typography>
      <Typography sx={{ fontSize: 26 }}>{result.perfect ? "Você acertou as 10 perguntas." : `Você acertou ${result.score} de ${TOTAL}.`}</Typography>
      {result.perfect ? (
        <>
          <Typography sx={{ fontSize: 14 }}>
            {result.title?.name ?? "O título"} foi desbloqueado. Escolha equipá-lo agora ou encontre-o depois em Minhas conquistas.
          </Typography>
          <Panel title="Título desbloqueado">
            {result.title && <AchievementTitleBadge title={result.title.name} owned />}
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Persistente na coleção, independente do acompanhamento. Equipar é opcional; um título por vez.
            </Typography>
          </Panel>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 14 }}>
            O título ainda não foi desbloqueado. Sua coleção de conquistas permanece igual; nenhuma recompensa parcial foi concedida.
          </Typography>
          <Panel title="Política de novas tentativas em definição">
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Nova tentativa é uma proposta pendente. Não é uma ação habilitada; nenhum limite, custo ou intervalo foi presumido.
            </Typography>
          </Panel>
        </>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {result.perfect && result.title && <EquipButton titleId={result.title.id} />}
        {result.perfect && (
          <Button component={NextLink} href="/conquistas" sx={ELEVATED_BUTTON_SX}>
            Ver minhas conquistas
          </Button>
        )}
        <Button component={NextLink} href={workHref} variant={result.perfect ? "outlined" : "contained"} sx={result.perfect ? ELEVATED_BUTTON_SX : undefined}>
          Voltar ao anime
        </Button>
        {!result.perfect && (
          <Button disabled sx={ELEVATED_BUTTON_SX} data-testid="quiz-retry-disabled">
            Tentar novamente · em definição
          </Button>
        )}
      </Box>
    </Box>
  );
}

function EquipButton({ titleId }: { titleId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function equip() {
    setState("busy");
    try {
      const res = await fetch("/api/users/me/titles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titleId }) });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <Box>
      <Button variant="contained" onClick={() => void equip()} disabled={state === "busy" || state === "done"} data-testid="quiz-equip">
        {state === "done" ? "✓ Equipado" : state === "busy" ? "Equipando…" : "Equipar título"}
      </Button>
      {state === "error" && (
        <Typography role="alert" sx={{ fontSize: 13, color: "primary.main", mt: 1 }}>
          Não foi possível equipar agora. Tente de novo em Minhas conquistas.
        </Typography>
      )}
    </Box>
  );
}

/**
 * Quiz da obra (Figma "20 — Quiz"). Estados: sem conta → entrar; sem acompanhar → acompanhar;
 * sem 10 perguntas aprovadas → indisponível; intro com aviso de spoiler (iniciar = consentimento);
 * uma pergunta por vez com "Confirmar resposta" (sem voltar e sem gabarito); resultado 10/10 (título)
 * ou qualquer outra nota (nada concedido, nova tentativa desabilitada).
 */
export function QuizExperience({ anilistId, work, state, loggedIn }: { anilistId: number; work: Work; state: QuizState; loggedIn: boolean }) {
  const quiz = state.quiz;
  const workHref = `/anime/${anilistId}`;
  const completed = state.attempt.status === "COMPLETED";
  const [phase, setPhase] = useState<Phase>(completed ? "result" : "intro");
  const [result, setResult] = useState<Result | null>(
    completed && state.attempt.score !== null ? { score: state.attempt.score, perfect: state.attempt.score === TOTAL, title: state.title ? { id: state.title.id, name: state.title.name } : null } : null
  );
  const [question, setQuestion] = useState<QuestionDTO | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${anilistId}/attempt`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar a pergunta.");
      setQuestion(data.question as QuestionDTO);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a pergunta.");
    } finally {
      setLoading(false);
    }
  }, [anilistId]);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${anilistId}/attempt`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível iniciar o quiz.");
      setPhase("question");
      setChoice(null);
      await loadQuestion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar o quiz.");
      setLoading(false);
    }
  }

  async function confirm() {
    if (choice === null || !question) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${anilistId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: question.position, choice }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível registrar a resposta.");
      if (data.finished) {
        setResult({ score: data.score, perfect: data.perfect, title: data.title });
        setPhase("result");
        setQuestion(null);
      } else {
        // Resposta registrada: carrega a próxima sem reenviar a anterior.
        setChoice(null);
        await loadQuestion();
      }
    } catch (e) {
      // A alternativa escolhida fica retida para tentar de novo.
      setError(e instanceof Error ? e.message : "Não foi possível registrar a resposta.");
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    setLeaving(true);
    try {
      await fetch(`/api/quiz/${anilistId}/attempt`, { method: "DELETE" });
      setLeaveOpen(false);
      setPhase("intro");
      setQuestion(null);
      setChoice(null);
    } finally {
      setLeaving(false);
    }
  }

  // Retoma uma tentativa em andamento (a pessoa recarregou a página no meio do quiz).
  useEffect(() => {
    if (state.attempt.status === "IN_PROGRESS" && phase === "intro") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("question");
      void loadQuestion();
    }
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gate = !quiz ? (
    <Panel title="Esta obra ainda não tem quiz" testId="quiz-none">
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Quando houver, ele aparece aqui e na página da obra.</Typography>
      <Box>
        <Button component={NextLink} href={workHref} sx={ELEVATED_BUTTON_SX}>
          Voltar ao anime
        </Button>
      </Box>
    </Panel>
  ) : !quiz.available ? (
    <Panel title="Experiência real · Indisponível" testId="quiz-unavailable">
      <Typography sx={{ fontSize: 14 }}>
        Este quiz ainda não possui 10 perguntas e gabarito editorialmente aprovados. Sem isso, não dá para iniciar uma tentativa real.
      </Typography>
      <Box>
        <Button disabled sx={ELEVATED_BUTTON_SX}>
          Iniciar · indisponível
        </Button>
      </Box>
    </Panel>
  ) : !loggedIn ? (
    <Panel title="Entre para fazer o quiz" testId="quiz-login">
      <Typography sx={{ fontSize: 14 }}>O quiz exige uma conta e a obra em Acompanhando.</Typography>
      <Box>
        <Button component={NextLink} href={loginHref(`/obra/${anilistId}/quiz`)} variant="contained">
          Entrar
        </Button>
      </Box>
    </Panel>
  ) : !state.following && !completed ? (
    <Panel title="Acompanhe a obra para fazer o quiz" testId="quiz-not-following">
      <Typography sx={{ fontSize: 14 }}>
        Entrar na conta e acompanhar o anime são condições de acesso, não um registro de que você assistiu aos episódios.
      </Typography>
      <Box>
        <Button component={NextLink} href={workHref} variant="contained">
          Acompanhar no detalhe da obra
        </Button>
      </Box>
    </Panel>
  ) : null;

  let main: React.ReactNode;
  if (phase === "result" && result) {
    main = <ResultPanel result={result} workHref={workHref} />;
  } else if (gate) {
    main = gate;
  } else if (phase === "question") {
    main = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="quiz-attempt">
        <Progress step={question?.position ?? state.attempt.answered + 1} />
        {loading && !question ? (
          <Typography role="status" sx={{ fontSize: 14, color: "text.secondary" }}>
            Carregando pergunta…
          </Typography>
        ) : question ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>{question.category.toUpperCase()}</Typography>
            <Typography component="h2" data-testid="quiz-question" sx={{ fontSize: { xs: 24, md: 30 }, lineHeight: 1.3 }}>
              {question.text}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Selecione uma alternativa e confirme. Nenhuma resposta correta é revelada.</Typography>
            <Box role="radiogroup" aria-label="Alternativas" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {question.options.map((option, i) => {
                const selected = choice === i;
                return (
                  <Box
                    key={LETTERS[i]}
                    component="button"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`quiz-option-${LETTERS[i]}`}
                    disabled={saving}
                    onClick={() => setChoice(i)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      minHeight: 72,
                      p: 3,
                      textAlign: "left",
                      cursor: "pointer",
                      color: "text.primary",
                      font: "inherit",
                      bgcolor: selected ? "#1b152b" : "background.paper",
                      border: 1,
                      borderColor: selected ? "#8b5cf6" : "divider",
                      borderRadius: "12px",
                      "&:hover": { borderColor: selected ? "#8b5cf6" : "text.secondary" },
                      "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 },
                    }}
                  >
                    <Box aria-hidden sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", border: "2px solid", borderColor: selected ? "#8b5cf6" : "text.secondary", display: "grid", placeItems: "center" }}>
                      {selected && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "#8b5cf6" }} />}
                    </Box>
                    <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                      {LETTERS[i]}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 16, flex: 1 }}>
                      {option}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{choice === null ? "Escolha uma alternativa para continuar" : "Confirme para registrar a resposta"}</Typography>
              <Button variant="contained" disabled={choice === null || saving} onClick={() => void confirm()} data-testid="quiz-confirm">
                {saving ? "Registrando…" : question.position === TOTAL ? "Confirmar e ver resultado" : "Confirmar resposta"}
              </Button>
            </Box>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Depois de confirmar, você avança à próxima pergunta. Não há volta para editar respostas registradas.</Typography>
          </Box>
        ) : null}
        {error && (
          <Box role="alert" data-testid="quiz-error" sx={{ display: "flex", flexDirection: "column", gap: 1.5, alignItems: "flex-start" }}>
            <Typography sx={{ fontSize: 14, color: "#ef4444" }}>{error} Sua seleção foi mantida.</Typography>
            <Button onClick={() => void (question ? confirm() : loadQuestion())} sx={ELEVATED_BUTTON_SX}>
              Tentar novamente
            </Button>
          </Box>
        )}
        <Box>
          <Button onClick={() => setLeaveOpen(true)} sx={{ color: "text.secondary" }} data-testid="quiz-leave">
            Sair do quiz
          </Button>
        </Box>
      </Box>
    );
  } else {
    main = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="quiz-intro">
        <Panel title="Como funciona">
          <Typography sx={{ fontSize: 14 }}>
            {TOTAL} perguntas, uma por página. Selecione uma alternativa e confirme antes de avançar. Acerte todas para desbloquear o título; não há título parcial.
          </Typography>
        </Panel>
        <Progress step={0} />
        <Box
          sx={{ bgcolor: "background.paper", borderRadius: "12px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}
          data-testid="quiz-spoiler-notice"
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <EyeOffIcon sx={{ fontSize: 18 }} />
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Este quiz contém spoilers</Typography>
          </Box>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            {quiz?.scope}. As perguntas ficam ocultas até seu consentimento explícito. Acompanhar a obra não significa que você já viu os episódios.
          </Typography>
          <Box>
            <Button variant="contained" onClick={() => void start()} disabled={loading} data-testid="quiz-start">
              {loading ? "Iniciando…" : "Entendo os spoilers · iniciar quiz"}
            </Button>
          </Box>
        </Box>
        {error && (
          <Typography role="alert" sx={{ fontSize: 14, color: "primary.main" }}>
            {error}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" }, columnGap: 6, rowGap: 5, alignItems: "start" }}>
      <Box sx={{ minWidth: 0 }}>{main}</Box>
      {quiz && <WorkColumn work={work} scope={quiz.scope} titleReward={quiz.titleReward} />}
      <ConfirmDialog
        open={leaveOpen}
        title="Sair do quiz?"
        effect="Abandonar não concede recompensa. Sua coleção e seu título atual são preservados. Você poderá iniciar de novo do começo."
        confirmLabel="Sair do quiz"
        busyLabel="Saindo…"
        busy={leaving}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => void leave()}
        confirmTestId="quiz-leave-confirm"
      />
    </Box>
  );
}
