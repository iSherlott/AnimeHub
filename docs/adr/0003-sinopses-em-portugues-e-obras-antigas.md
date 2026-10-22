# ADR 0003 — Sinopses em português e obras antigas (Epic 44)

Status: aceito.

## Contexto

1. Parte das obras aparecia com a sinopse em inglês. A causa tinha três partes: a tradução gratuita (MyMemory) só aguenta
   ~30 sinopses por dia; obras que vieram só do AniDB nunca eram traduzidas; e, quando a tradução falhava, o site mostrava o
   inglês sem avisar.
2. As obras que estrearam antes de 2000 não estavam no catálogo. A API HTTP do AniDB só consulta uma obra por id (não lista por
   ano) e hoje recusa o cliente do `.env` ("client version missing or invalid").

## Decisões

### Tradução

- A tradução é gravada na própria obra (`CatalogEntry.descriptionPt` / `descriptionJa`) e em `SynopsisTranslation`, para valer
  também para obras sem id da AniList. A página recebe o texto já traduzido do servidor e não faz pedido extra nem pisca em inglês.
- Motor próprio opcional: `LIBRETRANSLATE_URL` (container local, sem cota). Sem ele, segue o MyMemory. `TRANSLATION_CONCURRENCY`
  controla quantos pedidos vão ao mesmo tempo (6 no LibreTranslate, 1 no gratuito).
- Admin → Curadoria ganhou o painel **Traduzir as sinopses**: roda em lote, da obra mais popular para a menos, pode ser retomado,
  e para sozinho quando a cota acaba (avisa) ou quando o serviço fica fora do ar (8 falhas seguidas).
- Quando a sinopse ainda não tem tradução o site mostra "Traduzindo a sinopse…"; se a tradução não está disponível, mostra o
  original em inglês com a nota "Sinopse ainda sem tradução".

### Obras antigas

- Entram pela AniList (Admin → AniList, `POST /api/admin/anilist/years`, anos 1917–1999): busca por temporada **e** por data de
  estreia, porque a AniList guarda muitas obras antigas só com o ano. Conteúdo adulto nunca entra. Obra que já estava na
  plataforma não é alterada. Obra com mês conhecido recebe a temporada; só com o ano, fica com o ano.
- O AniDB será ligado depois, obra a obra, pelo id (`getAnidbAnimeById`), quando houver um cliente válido registrado em
  anidb.net. Enquanto isso não se chama a API: pedidos recusados repetidos podem levar a banimento.
- Depois da carga roda a curadoria (títulos, gêneros, tipo, nota, linha do tempo) e a tradução das sinopses novas.

## Pendências

- Registrar o cliente do AniDB (nome e versão) e preencher `ANIDB_CLIENT_NAME` / `ANIDB_CLIENT_VERSION` sem aspas.
- Tradução para japonês (`lang: "ja"`) das sinopses: o motor já aceita, falta decidir se vale rodar.
