# Pendências de curadoria: prioridade e ciclo

Este documento cobre a Fase 7 (§14).

## Prioridade por impacto

A prioridade de cada tipo de pendência vem do impacto no produto (padrão em `src/lib/curation/priority.ts`):

| Prioridade | Tipos | Por quê |
|---|---|---|
| Alta | DUPLICATE_SUSPECT, TIMELINE_CONFLICT, ANILIST_NOT_FOUND | identidade ambígua, relação de franquia incoerente, obra que a fonte não acha mais |
| Média | NAME_INVALID, SYNOPSIS_EN_MISSING, TITLE_JA_MISSING, NO_GENRE, KIND_UNKNOWN, TIMELINE_UNDATED | falta algo que as pessoas veem |
| Informativa | TITLE_EN_MISSING, OFFICIAL_SITE_MISSING, ADULT_REMOVED | campo opcional que a fonte não tem, ou registro |

Para mudar sem tocar no código, use a variável de ambiente `CURATION_PRIORITIES`, com um JSON que sobrepõe o padrão:

```
CURATION_PRIORITIES={"OFFICIAL_SITE_MISSING":"media","TITLE_EN_MISSING":"informativa"}
```

## Estados

- **Aberta:** a condição existe.
- **Resolvida:** a condição sumiu. Quem marca é a curadoria, a auditoria ou o admin. O admin só consegue marcar quando a condição foi atendida na obra; nos tipos que dependem de decisão (duplicidade, conflito de linha do tempo), precisa dar o motivo.
- **Ignorada:** decisão do admin, com justificativa obrigatória. A curadoria mantém ignorada enquanto a condição for a mesma.
- **Reaberta:** uma resolvida cuja condição voltou. O contador `reopenCount` registra a recorrência.

## Indicadores

Admin → Pendências mostra:

- abertas, e quantas delas têm prioridade alta;
- resolvidas, no total e nos últimos 30 dias;
- ignoradas;
- tempo médio de resolução (só das que têm a data real de resolução, registrada a partir da Fase 7);
- recorrentes e a taxa de reabertura;
- abertas por tipo e por fonte.
