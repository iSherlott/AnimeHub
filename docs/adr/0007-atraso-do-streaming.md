# ADR 0007 — Atraso do streaming por obra (Epic 50)

Status: aceito em 24/10/2026.

## Contexto

As fontes (AniList, AniDB) dão o horário da **TV japonesa**. Quem assiste pelo streaming vê o episódio sair depois: Tensei
Goblin Dakedo Shitsumon Aru? passa às 22:00 no Japão (10:00 em São Paulo) e sai no Crunchyroll às 12:00. O calendário
mostrava 10:00 e parecia errado. Nenhuma fonte informa o horário do streaming.

## Decisão

- **Por obra, o admin diz quanto depois sai no streaming** (`CatalogEntry.streamingDelayMinutes`, de −24 h a +24 h, e
  `streamingSite`, ex.: "Crunchyroll"), em Admin → Overrides → "Atraso do streaming" ou `POST /api/admin/streaming-delay`.
- **O horário gravado passa a ser o do streaming.** A agenda (`AiringScheduleEntry.airingAt`) e o próximo episódio do
  catálogo (`nextEpisodeAt`) são gravados já com o atraso (`cacheAiringSchedule`, `cacheAniListMedia`,
  `mergeCatalogFields`), então calendário, sino, "próximo episódio", Explorar e alertas de reagendamento usam o mesmo
  horário sem mudar quem lê. Gravar, trocar ou tirar o atraso desloca o que já está gravado pela diferença.
- **O horário da TV continua visível:** o card do calendário mostra "Crunchyroll · no Japão 10:00" (gravado − atraso).
- **A limpeza da agenda confere pelo horário da TV** (`pruneMissingFutureEntries`): um episódio que já passou na TV mas
  ainda vai sair no streaming não é apagado por ter sumido da janela da AniList.
- **Overrides manuais de um episódio continuam valendo como estão** (têm prioridade sobre o atraso).

## Consequências

- Vale também para os serviços de fundo (calendar-loader, cache-updater), que usam as mesmas funções de `src/lib`: o
  ambiente que roda precisa da versão com o Epic 50, senão o carregador antigo regrava o horário da TV.
- Spec 102 e testes unitários de `streamingDelay` e `airingCache`.
