# AnimeHub

Rede social fechada sobre anime. O administrador cura um catálogo trazido da AniList e do AniDB e cria as contas.
Cada pessoa acompanha as obras da temporada, recebe os avisos de episódio novo no sino e conversa com os amigos.
A conversa acontece no Feed, nas comunidades e no perfil.

Este README é a porta de entrada. As decisões estão nos ADRs (`docs/adr/`), a arquitetura em `docs/arquitetura/` e o
deploy em `deploy/k8s/`.

## O que tem

| Área | Onde | O que faz |
| --- | --- | --- |
| Catálogo | `/discover`, `/temporada/<slug>`, `/anime/<id>` | Explorar por temporada, gênero e tipo; ficha da obra com episódios, personagens, aberturas, X oficial e onde assistir |
| Calendário e sino | `/calendar`, sino do cabeçalho | Agenda semanal dos episódios; aviso de episódio novo, "data alterada" e "voltou a sair". Abrir a prévia no calendário apaga o aviso da obra |
| Minha lista | `/minha-lista` | Acompanhar, pausar, "para assistir", terminei/não terminei/dropei e nota |
| Episódios | ficha da obra (quem acompanha) | Reação, nota de 1 a 5 e diário por episódio, com a curva da temporada |
| Feed | `/` | Publicações com spoiler por trecho, imagem ou episódio. O spoiler "até o episódio N" abre 7 dias depois da estreia. Notícias do NewsHub, anime da semana, atividade dos amigos e recomendações |
| Social | `/users/<id>`, `/amigos`, `/comunidades` | Perfil com recados, depoimentos, álbuns e afinidade de gosto. Amizades, recomendar obra a um amigo e comunidades com fórum, enquetes e eventos |
| Temporada | `/retrospectiva`, `/tier-list`, `/bolao`, `/aberturas`, `/eventos` | Retrospectiva (obras e gêneros), tier list publicável, bolão, ranking de aberturas e agenda de eventos |
| Quiz e títulos | `/obra/<id>/quiz`, `/conquistas` | 10 de 10 num quiz dá um título para o perfil |
| Admin | `/admin` | Importações (HTML do AniDB), curadoria e pendências, episódios, calendário, traduções, scrapers (notícias), elenco e aberturas, eventos e votações, acesso e moderação, jobs e logs. A aba Sistema do sino avisa quando um serviço falha |

**Sistema fechado.** Quem não entrou vê só o catálogo: Explorar, Calendário, Temporada, a ficha da obra e o login. As
contas nascem em Admin → Acesso. O admin manda à pessoa um link de uso único, válido por 48 h, para ela definir a senha.

## Tecnologia

- Next.js 16 (App Router), React 19 e MUI 9, em TypeScript.
- Prisma 6 sobre PostgreSQL. O schema do app é `animehub`.
- Serviços de fundo em `services/`, cada um com sua imagem:
  - `calendar-loader`: agenda da AniList;
  - `cache-updater`: catálogo e episódios;
  - `notifier`: avisos do sino;
  - `news-fetcher`: notícias do ANN, dos sites oficiais e da MyAnimeList;
  - `name-resolver`: títulos.
- Tradução das sinopses pelo LibreTranslate próprio, com o MyMemory de reserva.
- Testes: Vitest (unitários, em `src/**/*.test.ts`) e Playwright (ponta a ponta, em `tests/`, com AniList, AniDB, Kitsu e
  notícias falsos).
- O site é instalável (manifesto e ícones). Ainda não há push: ele exige HTTPS.

## Rodando no computador

O banco de desenvolvimento fica no notebook (`datatrade`, schema `animehub`). O `.env` aponta para ele e não vai para o
git. Para começar, copie o `.env.example` e preencha.

```bash
npm install
```

```bash
npm run dev
```

Os serviços de fundo, fora do Docker, nas portas 4001 a 4005:

```bash
npm run services
```

Migrações: só se acrescenta. Nunca se apaga coluna ou tabela; o que sai vai para o schema `animehub_archive`.

```bash
npx prisma migrate deploy
```

O `prisma generate` falha com EPERM se o servidor de desenvolvimento ou um script estiver usando o banco. Pare os dois,
gere e suba de novo.

## Testes

Os testes de ponta a ponta usam um Postgres local (`localhost:5432`, banco `animehub_test`). O setup apaga e migra esse
banco a cada rodada.

```bash
docker compose up -d postgres
```

```bash
npx eslint .
```

```bash
npx tsc --noEmit -p .
```

```bash
npm run test:unit
```

```bash
npx playwright test --reporter=line
```

Para rodar só algumas specs: `npx playwright test tests/149-afinidade-recomendar-atividade.spec.ts`.

Se o Docker Desktop não subir depois de uma queda de energia, renomeie a pasta `%LOCALAPPDATA%\Docker\run`. Ela guarda
um socket preso.

## Deploy

O site roda num cluster Kubernetes (k3d) no notebook. O roteiro completo, com caixas de marcar e a conferência em SQL,
está em [`deploy/k8s/checklist-atualizacao-28-10.md`](deploy/k8s/checklist-atualizacao-28-10.md). Em resumo:

1. Faça o backup do schema `animehub`.
2. Rode `bash deploy/k8s/atualizar.sh`. Ele para no primeiro erro, gera as 7 imagens, confere a última migração dentro da
   imagem, migra o banco e só então troca o site.
3. Confira com `deploy/k8s/conferir-atualizacao.sql`.

## Carga de temporada

Em Admin → Importações, cole o HTML da listagem de temporada do AniDB e escolha a temporada (por exemplo, Winter2027).
Revise as pendências do matching e confirme. Depois rode a curadoria. Em Admin → Elenco e aberturas, carregue os
personagens e as músicas. Os HTMLs das cargas ficam em `docs/carga/`.

## Convenções

- Texto da interface em português, escrito do ponto de vista de quem usa ("Esqueci a senha", não "reset de credencial").
- Nunca inventar dado. Sem fonte, o campo fica vazio e vira pendência da curadoria.
- Rotas de API novas exigem login, a menos que sejam públicas por decisão (`src/lib/routeAuthorization.test.ts` confere).
- Nada de "orkut" em nomes de arquivo, rota ou texto.
- Não rode `npx prettier --write`: o projeto não segue essa configuração.
