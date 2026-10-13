"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { SmallChip } from "@/components/admin/AdminUi";
import { SearchField } from "@/components/FilterField";
import { EmptyState, ErrorNotice, Notice } from "@/components/StatePanels";
import type { LinkView, LinkWork, SuggestionView } from "@/lib/workLinkActions";

const rowSx = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: 1.5, py: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", minWidth: 0 } as const;

function Cover({ src }: { src: string | null }) {
  return (
    <Box
      aria-hidden
      sx={{ width: 40, height: 56, flexShrink: 0, borderRadius: "6px", overflow: "hidden", bgcolor: "#171820", ...(src ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}
    />
  );
}

function WorkCell({ work, caption }: { work: LinkWork; caption: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, flex: "1 1 220px" }}>
      <Cover src={work.coverImage} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>{caption}</Typography>
        <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{work.title}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[work.seasonLabel, `AniList #${work.anilistId}`].filter(Boolean).join(" · ")}</Typography>
      </Box>
    </Box>
  );
}

/** Escolha de uma obra por nome (junção manual): busca na plataforma e mostra o resultado para clicar. */
function WorkPicker({ label, testId, picked, onPick }: { label: string; testId: string; picked: LinkWork | null; onPick: (work: LinkWork | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkWork[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/admin/work-links/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { works: [] }))
        .then((data: { works?: LinkWork[] }) => {
          if (!cancelled) setResults(data.works ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim().length < 2 ? [] : results;

  return (
    <Box data-testid={testId} sx={{ display: "flex", flexDirection: "column", gap: 1.5, flex: "1 1 320px", minWidth: 0 }}>
      {picked ? (
        <Box sx={{ ...rowSx, flexWrap: "nowrap" }}>
          <WorkCell work={picked} caption={label} />
          <Button onClick={() => onPick(null)} sx={ELEVATED_BUTTON_SX}>
            Trocar
          </Button>
        </Box>
      ) : (
        <>
          <SearchField label={label} value={query} onChange={setQuery} placeholder="Buscar pelo nome…" />
          {shown.length > 0 && (
            <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 0.75, p: 0, m: 0, listStyle: "none" }}>
              {shown.map((w) => (
                <Box component="li" key={w.anilistId}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onPick(w)}
                    data-testid={`${testId}-result-${w.anilistId}`}
                    sx={{ ...rowSx, width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", flexWrap: "nowrap", "&:hover": { borderColor: "text.secondary" } }}
                  >
                    <Cover src={w.coverImage} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{w.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[w.seasonLabel, `AniList #${w.anilistId}`].filter(Boolean).join(" · ")}</Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * Admin → Match name: o admin confirma (ou recusa) as obras que parecem continuação pelo nome e também liga duas obras à
 * mão ("Naruto" → "Boruto"). Confirmar junta as duas na mesma franquia; nada acontece sem a decisão explícita.
 */
export function MatchNamePanel({ suggestions, confirmed, rejected }: { suggestions: SuggestionView[]; confirmed: LinkView[]; rejected: LinkView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<LinkWork | null>(null);
  const [later, setLater] = useState<LinkWork | null>(null);

  async function send(key: string, request: () => Promise<Response>, success: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const res = await request();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a decisão. Tente novamente.");
        return false;
      }
      setDone(success);
      router.refresh();
      return true;
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const decide = (e: LinkWork, l: LinkWork, decision: "confirm" | "reject", origin: "SUGGESTED" | "MANUAL") =>
    send(
      `${decision}-${l.anilistId}`,
      () => fetch("/api/admin/work-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ earlierAnilistId: e.anilistId, laterAnilistId: l.anilistId, decision, origin }) }),
      decision === "confirm" ? `${l.title} agora é continuação de ${e.title}.` : `${l.title} não é continuação de ${e.title}; a sugestão não volta.`
    );

  async function join() {
    if (!earlier || !later) return;
    if (await decide(earlier, later, "confirm", "MANUAL")) {
      setEarlier(null);
      setLater(null);
    }
  }

  const undo = (link: LinkView) =>
    send(`undo-${link.id}`, () => fetch(`/api/admin/work-links?id=${encodeURIComponent(link.id)}`, { method: "DELETE" }), link.status === "CONFIRMED" ? "Ligação desfeita: as obras voltaram às franquias de antes." : "Decisão desfeita: a sugestão pode voltar.");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && <ErrorNotice title="Algo não deu certo" testId="match-name-error">{error}</ErrorNotice>}
      {done && (
        <Notice tone="success" title="Decisão salva" testId="match-name-done">
          {done}
        </Notice>
      )}

      <Box component="section" aria-labelledby="mn-suggestions" data-testid="match-name-suggestions" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography id="mn-suggestions" component="h2" sx={{ fontSize: 20 }}>
          Sugestões pelo nome ({suggestions.length})
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Obras cujo nome acrescenta um número ou complementa o nome de outra mais antiga. Confirme as que são continuação; as que não são ficam recusadas e não voltam.
        </Typography>
        {suggestions.length === 0 ? (
          <EmptyState testId="match-name-empty" icon={<LinkOutlinedIcon />} title="Nenhuma sugestão por enquanto.">
            Quando uma importação trouxer obras com nome parecido, elas aparecem aqui para você decidir. Para casos como Naruto e Boruto, use “Juntar manualmente”.
          </EmptyState>
        ) : (
          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0, m: 0, listStyle: "none" }}>
            {suggestions.map((s) => (
              <Box component="li" key={`${s.earlier.anilistId}-${s.later.anilistId}`} data-testid={`suggestion-${s.later.anilistId}`} sx={rowSx}>
                <WorkCell work={s.earlier} caption="Veio antes" />
                <ArrowForwardIcon aria-hidden sx={{ color: "text.secondary" }} />
                <WorkCell work={s.later} caption="Continuação?" />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: "1 1 200px", minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>O nome {s.reason}.</Typography>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button variant="contained" size="small" disabled={busy !== null} onClick={() => void decide(s.earlier, s.later, "confirm", "SUGGESTED")} data-testid={`confirm-${s.later.anilistId}`}>
                      {busy === `confirm-${s.later.anilistId}` ? "Juntando…" : "É continuação"}
                    </Button>
                    <Button size="small" disabled={busy !== null} onClick={() => void decide(s.earlier, s.later, "reject", "SUGGESTED")} sx={ELEVATED_BUTTON_SX} data-testid={`reject-${s.later.anilistId}`}>
                      Não é
                    </Button>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" aria-labelledby="mn-manual" data-testid="match-name-manual" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography id="mn-manual" component="h2" sx={{ fontSize: 20 }}>
          Juntar manualmente
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Para obras que continuam outra mesmo com nomes diferentes (Naruto → Boruto). Escolha a que veio antes e a continuação: as duas passam a contar como uma só obra, com as temporadas em ordem.
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "flex-start" }}>
          <WorkPicker label="Obra anterior" testId="pick-earlier" picked={earlier} onPick={setEarlier} />
          <WorkPicker label="Continuação" testId="pick-later" picked={later} onPick={setLater} />
        </Box>
        <Box>
          <Button variant="contained" startIcon={<LinkOutlinedIcon />} disabled={!earlier || !later || busy !== null} onClick={() => void join()} data-testid="join-works">
            {busy?.startsWith("confirm-") && earlier && later ? "Juntando…" : "Juntar as duas obras"}
          </Button>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="mn-decided" data-testid="match-name-decided" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography id="mn-decided" component="h2" sx={{ fontSize: 20 }}>
          Já decididas ({confirmed.length + rejected.length})
        </Typography>
        {confirmed.length + rejected.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma decisão ainda.</Typography>
        ) : (
          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0, m: 0, listStyle: "none" }}>
            {[...confirmed, ...rejected].map((link) => (
              <Box component="li" key={link.id} data-testid={`decided-${link.later.anilistId}`} data-status={link.status} sx={rowSx}>
                <WorkCell work={link.earlier} caption="Veio antes" />
                <ArrowForwardIcon aria-hidden sx={{ color: "text.secondary" }} />
                <WorkCell work={link.later} caption="Continuação" />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-start" }}>
                  <SmallChip tone={link.status === "CONFIRMED" ? "success" : "neutral"}>{link.status === "CONFIRMED" ? (link.origin === "MANUAL" ? "Junção manual" : "Confirmada") : "Recusada"}</SmallChip>
                  <Button size="small" disabled={busy !== null} onClick={() => void undo(link)} sx={ELEVATED_BUTTON_SX} data-testid={`undo-${link.later.anilistId}`}>
                    {link.status === "CONFIRMED" ? "Desfazer" : "Voltar a sugerir"}
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
