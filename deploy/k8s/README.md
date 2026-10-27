# Anime Hub no Kubernetes do notebook (porta 8010)

Sobe o site, os 5 serviços de fundo e o tradutor no cluster do notebook, usando o banco que já está lá (`datatrade`,
schema `animehub`). O site fica em `http://<IP do notebook>:8010`.

| Arquivo | O que é |
|---|---|
| `build-images.sh` | Gera as 7 imagens (site, migração, 5 serviços) e entrega ao cluster, sem registry |
| `animehub.env.example` | Modelo das variáveis (banco, cookie, serviços); vira o Secret `animehub-env` |
| `namespace.yaml`, `storage.yaml` | Namespace `animehub` e os volumes (uploads e modelos do tradutor) |
| `migrate-job.yaml` | Aplica as migrações do banco e termina |
| `web.yaml` | O site, com o Service na porta 8010 |
| `services.yaml` | calendar-loader, name-resolver, cache-updater, notifier, news-fetcher |
| `libretranslate.yaml` | Tradução das sinopses (opcional) |

## Passo a passo

Todos os comandos rodam **no notebook**, na raiz do projeto, salvo onde está escrito outra coisa.

### 1. Pré-requisitos

```bash
kubectl get nodes -o wide        # o cluster responde? anote o INTERNAL-IP do nó
kubectl version                  # "k3s" ou "microk8s" aparece na versão do servidor?
docker version                   # Docker para gerar as imagens
```

Se o Docker já existe, **não instale nada por cima**: o pacote `docker.io` do Debian remove o `docker-ce` oficial (e, com
ele, qualquer cluster k3d ou contêiner que dependa dele). Só instale se faltar de verdade, pelo repositório oficial do
Docker.

### 2. Trazer o projeto

```bash
git clone https://github.com/iSherlott/AnimeHub.git animehub && cd animehub
```

Para atualizar depois: `git pull`.

### 3. Achar o Postgres dentro do cluster

```bash
kubectl get svc -A | grep 31100
```

A linha mostra `NAMESPACE`, `NAME` e `PORT(S)` (algo como `5432:31100/TCP`). Dentro do cluster o endereço do banco é
`<NAME>.<NAMESPACE>.svc.cluster.local:5432` — mais estável que o IP do notebook, que muda quando o roteador quer.

### 4. Variáveis

```bash
cp deploy/k8s/animehub.env.example deploy/k8s/animehub.env
nano deploy/k8s/animehub.env
```

Troque `ANIME_HUB_DATABASE_URL` pelo usuário, senha e endereço do passo 3 (a mesma URL do `.env` do Windows, só com o
host interno). Mantenha `SESSION_COOKIE_SECURE=false` enquanto não houver HTTPS na frente. Esse arquivo fica fora do git.

### 5. Gerar as imagens

```bash
bash deploy/k8s/build-images.sh
```

Leva alguns minutos na primeira vez. O script descobre se o cluster é k3s, microk8s ou containerd e importa as imagens
nele; para forçar, use `IMPORT_TO=k3s bash deploy/k8s/build-images.sh` (ou `microk8s`, `containerd`, `docker`).

### 6. Namespace e Secret

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl -n animehub create secret generic animehub-env --from-env-file=deploy/k8s/animehub.env
```

Para mudar uma variável depois: edite o arquivo e rode
`kubectl -n animehub create secret generic animehub-env --from-env-file=deploy/k8s/animehub.env --dry-run=client -o yaml | kubectl apply -f -`
e então `kubectl -n animehub rollout restart deploy`.

### 7. Migração do banco

```bash
kubectl apply -f deploy/k8s/migrate-job.yaml
kubectl -n animehub logs -f job/animehub-migrate
```

Deve terminar com "All migrations have been successfully applied" ou "No pending migrations to apply" (o banco do
notebook já está em dia com o desenvolvimento).

### 8. Subir o resto

```bash
kubectl apply -k deploy/k8s
kubectl -n animehub get pods -w
```

Espere todos em `Running` e `1/1` (o `libretranslate` demora alguns minutos na primeira vez: baixa ~1 GB de modelos).
Sem tradução própria, tire `libretranslate.yaml` do `kustomization.yaml` e a linha `LIBRETRANSLATE_URL` do env.

### 9. Porta 8010

```bash
kubectl -n animehub get svc web
```

- **k3s:** o `EXTERNAL-IP` mostra o IP do notebook e a porta `8010`. Pronto.
- **k3d (k3s dentro do Docker):** o Service abre a 8010 dentro do contêiner do nó; falta o balanceador do k3d
  repassar a porta do notebook para ele (recria o `serverlb`, uns segundos fora do ar para as outras portas do
  cluster): `k3d cluster edit <cluster> --port-add "8010:8010@loadbalancer"`.
- **microk8s ou outro cluster sem balanceador** (`EXTERNAL-IP` fica `<pending>`): abra a porta direto no nó. Em
  `web.yaml`, troque o Service para `type: ClusterIP` e, no container, acrescente `hostPort: 8010` ao lado de
  `containerPort: 3000`; depois `kubectl apply -k deploy/k8s`.

Se o notebook usa firewall: `sudo ufw allow 8010/tcp`.

### 10. Conferir

```bash
curl -s http://localhost:8010/api/auth/me      # {"user":null} = o site responde e lê o banco
kubectl -n animehub logs deploy/web --tail=50
```

No navegador de outro aparelho: `http://<IP do notebook>:8010`. A sua conta e a sua lista são as mesmas (mesmo banco).

### 11. Trazer os uploads (avatar, imagens dos posts)

Os arquivos enviados até hoje estão no Windows, em `storage/uploads`. Copie a pasta para o notebook e depois para o
volume do site:

```bash
kubectl -n animehub cp storage/uploads/. "$(kubectl -n animehub get pod -l app=web -o name | cut -d/ -f2)":/app/storage/uploads/
```

### 12. Desligar o ambiente do Windows

Com o cluster no ar, não rode mais o `scripts/iniciar-ambiente.cmd` no Windows: os dois ambientes gravariam no mesmo
banco ao mesmo tempo (calendário, alertas, notícias em dobro). Para desenvolver no Windows, desligue o
`calendar-loader`, o `notifier` e o `news-fetcher` de um dos lados.

## Atualizar para uma versão nova

```bash
git pull
bash deploy/k8s/build-images.sh
kubectl -n animehub delete job animehub-migrate --ignore-not-found
kubectl apply -f deploy/k8s/migrate-job.yaml && kubectl -n animehub wait --for=condition=complete job/animehub-migrate --timeout=300s
kubectl apply -k deploy/k8s
kubectl -n animehub rollout restart deploy
```

### Atualização das Fases 2 a 10 (catálogo, episódios e painel administrativo)

Esta versão traz 6 migrações (`20261025100000` a `20261030100000`). Todas só acrescentam: colunas, tabelas, gatilhos e cópias dos dados antigos. Nada é apagado. Mesmo assim, duas delas mexem em muitas linhas:

- **episódios globais:** copia os episódios por usuário para o episódio da obra;
- **taxonomia:** regrava os gêneros pelo vocabulário e cria os gatilhos.

Por isso, faça um backup do schema antes:

```bash
pg_dump "<URL do banco sem ?schema=…>" --schema=animehub -Fc -f animehub-antes-fase10.dump
```

Depois siga os passos de "Atualizar para uma versão nova" acima e confira o resultado:

1. `kubectl -n animehub logs job/animehub-migrate` termina com "All migrations have been successfully applied".
2. Admin → Saúde do catálogo abre, e a seção "Integridade" mostra o que ainda está sem vínculo (o botão "Ligar ao catálogo" resolve).
3. Admin → Taxonomia lista os gêneros. Os que aparecem como "não registrados" vieram de dados antigos fora do vocabulário: registre como variação de um gênero, mescle ou exclua.
4. Os papéis novos (Curador, Moderador) só se dão em Admin → Acesso e moderação → Usuários. Ninguém ganha papel sozinho.

As migrações `20261031100000_anidb_only_episodes` (episódios das obras só do AniDB) e `20261101100000_episode_extras`
(especiais, aberturas, trailers do AniDB como extras da obra) vieram depois, na mesma atualização.

A migração `20261102100000_archive_episode_watchprogress` tira `Episode` e `WatchProgress` do schema do app e as guarda no
schema `animehub_archive` (nada é apagado). O usuário do banco precisa poder criar schema (`CREATE` no banco). Depois de
conferir que nada ali faz falta, apagar de vez é `DROP SCHEMA "animehub_archive" CASCADE;`.

A migração `20261103100000_follow_catalog_only_works` permite acompanhar obras sem AniList ID. Ela confere antes se
alguém tem dois itens de lista na mesma obra do catálogo; se tiver, para com a lista (junte os itens e rode de novo).

A migração `20261104100000_field_update_sources` só acrescenta uma coluna (atualização seletiva pela Kitsu e pelo AniDB).
O lote pela Kitsu usa `KITSU_API_BASE_URL`; o lote pelo AniDB usa as mesmas variáveis do lote de episódios do AniDB.

A migração `20261105100000_catalog_only_community` (comunidade das obras sem AniList ID) só acrescenta colunas e índices
e relaxa o AniList ID de comentários e quizzes.

A migração `20261106100000_communities` (o fórum de cada anime, ADR 0011) só cria tabelas, e a
`20261107100000_community_orkut` (eventos, denúncias, fixar/trancar, descrição) só acrescenta. A
`20261108100000_profile_orkut` (perfil no formato do Orkut, ADR 0012: favoritos, recados, depoimentos, fãs e avaliações)
também só acrescenta, assim como a `20261109100000_community_notifications` (avisos das comunidades no sino). A `20261110100000_friendships` cria a
amizade separada do seguir e transforma em amizade quem já se seguia mutuamente (só acrescenta linhas). A `20261111100000_profile_reports` (denúncias de recados e depoimentos) só cria uma tabela. A `20261112100000_scrap_replies` (responder recado) só acrescenta uma coluna. A `20261113100000_birthdays` (aniversário no perfil) só acrescenta duas colunas.

Para o lote do AniDB funcionar, o servidor precisa de `ANIDB_CLIENT_NAME` e `ANIDB_CLIENT_VERSION` (o client registrado no
AniDB). Opcional: `ANIDB_REQUEST_GAP_MS` (intervalo entre obras, padrão 4000 ms; não baixe de 2000).

#### Ordem segura desta atualização (20 migrações, de `20261025100000` a `20261113100000`)

O site do cluster e o desenvolvimento no Windows usam o **mesmo banco**. O código antigo ainda lê a tabela `Episode`, que
a migração de 02/11 arquiva: migrar o banco sem atualizar o cluster derruba as páginas de obra do site antigo. Por isso,
banco e site sobem juntos, pelo próprio Job de migração:

1. Backup do schema (passo acima). Ensaio de 26/10: as 12 primeiras migrações (as 8 últimas, das comunidades e do perfil, só acrescentam) rodaram numa cópia restaurada do banco em ~12 s, sem
   erro; 800 itens de lista e 7.952 produções ficaram ligados ao catálogo, 209 episódios vieram da tabela antiga e
   nenhum ficou sem obra.
2. No Windows, pare o `npm run dev` e o `npm run services` (eles gravariam no banco durante a migração).
3. No notebook, "Atualizar para uma versão nova" (acima): `git pull`, `build-images.sh`, Job de migração, `apply`,
   `rollout restart`.
4. Confira: `curl -s http://localhost:8010/api/auth/me`, uma página de obra, Admin → Saúde do catálogo e Admin →
   Taxonomia. No ensaio, só o gênero "Supernatural" (208 obras) ficou fora do vocabulário: registre, mescle ou remova.
5. Só então volte a rodar o desenvolvimento no Windows (o código dele já é o novo).

Para voltar atrás: com o site parado, `pg_restore --clean --if-exists -d "<URL sem ?schema=…>" --schema=animehub
<backup>.dump` (cliente do Postgres 18, o mesmo do servidor), `DROP SCHEMA "animehub_archive" CASCADE;` e as imagens
anteriores.

Variável opcional: `CURATION_PRIORITIES` (JSON). Ela muda a prioridade de um tipo de pendência, por exemplo `{"OFFICIAL_SITE_MISSING":"media"}` (veja `docs/arquitetura/pendencias.md`).

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Pod em `ErrImageNeverPull` | A imagem não chegou ao cluster: rode o passo 5 de novo com o `IMPORT_TO` certo |
| `migrate` falha com "Can't reach database" | Endereço do passo 3 errado; teste com `kubectl -n animehub run pg --rm -it --image=postgres:16-alpine -- psql "<URL sem ?schema=…>"` |
| Login não "segura" | `SESSION_COOKIE_SECURE=false` faltando no env (passo 6) |
| `web` reinicia sem parar | `kubectl -n animehub logs deploy/web --previous`; quase sempre é a URL do banco |
| PVC em `Pending` | O cluster não tem StorageClass padrão: no microk8s, `microk8s enable hostpath-storage` |
