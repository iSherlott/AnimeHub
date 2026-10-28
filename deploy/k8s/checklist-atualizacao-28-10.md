# Checklist da atualização de 28/10/2026 (28 migrações)

O banco do cluster e o do desenvolvimento no Windows são o mesmo (`datatrade`, schema `animehub`). Ele parou na
migração `20261024120000_streaming_delay`; esta versão traz **28 migrações**, de `20261025100000` a
`20261120100000`. Todas só acrescentam, com duas exceções que mexem em dados existentes:

- `20261102100000_archive_episode_watchprogress` **move** `Episode` e `WatchProgress` para o schema
  `animehub_archive`. Nada é apagado. O site antigo lê `Episode`, por isso banco e site sobem juntos.
- `20261115110000_avatar_from_anime_only` **zera os avatares enviados**: quem tinha foto própria volta às iniciais.
  Os arquivos continuam em `storage/uploads/avatars`.

Marque cada item ao concluir. Os comandos são para o terminal do notebook, na pasta do projeto.

## Ensaio feito antes (28/10, aqui no Windows)

Uma cópia do banco (o backup de 26/10, `backups-animehub/animehub-antes-fases-2-a-11-20261026-1250.dump`) foi
restaurada num Postgres 18 separado, e as 27 migrações foram aplicadas com `prisma migrate deploy`, como faz o Job:

- **Tempo:** cerca de 12 s, contando a partida do Prisma.
- **Migrações:** 74 aplicadas, 0 com falha.
- **Vínculos com o catálogo:** os 800 itens de lista e as 7.952 produções ficaram ligados; 42.138 episódios globais.
- **Arquivamento:** as 2 tabelas foram para `animehub_archive`.
- **Contas:** 1 administrador e nenhuma conta com senha provisória. O avatar que sobrou é imagem de personagem da
  AniList, o que está certo.
- **O site atual contra a cópia migrada:** 24 páginas e rotas abriram com 200, entre elas Feed, Explorar,
  Calendário, Minha Lista, Comunidades, perfil, Configurações, a página da obra e o painel (Acesso, Taxonomia, Obras,
  Saúde).
- **Banco novo, do zero:** as 74 migrações levaram cerca de 6 s, e o comando do primeiro administrador (abaixo)
  funcionou de ponta a ponta. O login com a senha provisória pediu a troca, e o painel só abriu depois dela.

Depois do ensaio entrou mais uma migração, `20261120100000_profile_background`, que só acrescenta a coluna do plano de
fundo do perfil (`User.backgroundUrl`, vazia). Ela foi aplicada no banco de testes da suíte.

O banco real pode ter mudado desde 26/10. Por isso o backup novo do passo 2 é obrigatório.

## 1. Antes de começar

- [ ] No Windows, o código está no `master` mais recente (último commit desta versão: a validação/spoiler de 28/10).
- [ ] No Windows, pare o `npm run dev` e o `npm run services`: eles gravariam no banco durante a migração.
- [ ] Ninguém usando o site nos próximos minutos (o site antigo quebra entre a migração e a troca das imagens).

## 2. Backup do schema

Com o cliente do Postgres 18, o mesmo do servidor (18.1). Pelo Docker, sem instalar nada:

```bash
docker run --rm -v "$PWD:/out" postgres:18-alpine pg_dump "<URL do banco sem ?schema=…>" --schema=animehub -Fc -f /out/animehub-antes-28-10.dump
```

- [ ] O arquivo `animehub-antes-28-10.dump` existe e tem dezenas de MB (o de 26/10 tinha 31 MB).
- [ ] Copie-o para fora do notebook (o de 26/10 está em `D:\My_Code\Challenge\backups-animehub\`).

## 3. Atualizar o cluster

Num comando só, que **para no primeiro erro**:

```bash
git pull && bash deploy/k8s/atualizar.sh
```

O script pergunta se o backup foi feito, gera as imagens e confere se a imagem de migração tem a última migração do
código. Só então migra o banco e, se a migração terminar, troca o site. Se algo falhar, ele para ali e diz o que
aconteceu, e o site continua na versão anterior.

- [ ] O script termina com "✓ Atualizado".
- [ ] No passo 5/6, o log da migração diz "All migrations have been successfully applied". Pode dizer "No pending
      migrations to apply" se o banco já estava em dia, mas só depois de o passo 4/6 confirmar a imagem.

> **Primeira tentativa (28/10).** Os comandos foram colados um por linha. O build da imagem do site estourou a
> memória do Node ("JavaScript heap out of memory"), porque a checagem de tipos passava de 2 GB com os testes juntos,
> e os comandos seguintes rodaram assim mesmo. O Job usou a imagem de migração antiga ("No pending migrations") e o
> site reiniciou com as imagens antigas: nada mudou no banco nem no site.
>
> A correção tem duas partes. O build da imagem passou a checar só o código do site (`tsconfig.build.json`, 0,9 GB) e
> ganhou folga de memória; ensaiado com o Node limitado a 2 GB, como no servidor, passou. E o `atualizar.sh` substitui
> a colagem dos comandos.

## 4. Conferir

```bash
docker run --rm -v "$PWD:/w" postgres:18-alpine psql "<URL do banco sem ?schema=…>" -f /w/deploy/k8s/conferir-atualizacao.sql
```

- [ ] Cada linha bate com o "espera" do lado: 75 migrações, 0 com falha, última `20261120100000_profile_background`, nenhum item
      de lista ou produção sem obra, 2 tabelas arquivadas, 1 ou mais administradores, nenhuma senha provisória,
      nenhum avatar enviado. Gênero não registrado não impede o site: registre, mescle ou remova em Admin → Taxonomia.
- [ ] A linha "contas sem nome de usuário" diz quantas contas ainda não têm @. Não impede o site: defina cada uma em
      Admin → Acesso e moderação → Usuários ("definir"), já que a pessoa não pode mais escolher o próprio @.
- [ ] `curl -s http://localhost:8010/api/auth/me` responde `{"user":null}`.
- [ ] No navegador, sem entrar: Explorar e Calendário abrem; o menu mostra só Calendário e Explorar; abrir
      `/comunidades` leva ao login.
- [ ] Entrando com a sua conta: Feed (com o campo "O que está acontecendo?"), uma página de obra, Comunidades, o seu
      perfil, Configurações (com "Spoilers" e "Senha") e Admin → Acesso e moderação (com "Criar conta"), Saúde do
      catálogo e Taxonomia.

## 5. Voltar ao trabalho no Windows

- [ ] Só agora rode de novo `npm run services` e `npm run dev`: o código do Windows já é o novo.

## O que muda para quem usa

- **Sistema fechado.**
  - Não existe mais cadastro aberto nem convite: as contas nascem em Admin → Acesso → Criar conta, com senha
    provisória.
  - Quem não entrou vê só Explorar, Calendário, Temporada e a página da obra.
- **Avatares enviados** voltam à foto padrão. Avatar, capa e o novo plano de fundo do perfil são sempre imagens dos
  animes que a pessoa acompanha; quem não escolheu avatar aparece com a foto padrão (não mais com as iniciais).
- **Nome de usuário (@) fixo.** O administrador define ao criar a conta; a pessoa não troca mais. Contas antigas sem @
  recebem pelo painel.
- **Novidades:**
  - campo de postar no Feed, com imagens, descrição (ALT) e spoiler (trecho, imagem e aviso por obra);
  - prévia ao tocar num anime;
  - comunidades (com categorias, ordem e as dos amigos), perfil social, amizades (com as pessoas da rede) e álbuns;
  - a aba Pausados em Meus Animes.

## Se algo der errado: voltar atrás

Com o site parado (`kubectl -n animehub scale deploy --all --replicas=0`):

```bash
docker run --rm -v "$PWD:/in" postgres:18-alpine pg_restore --clean --if-exists -d "<URL do banco sem ?schema=…>" --schema=animehub /in/animehub-antes-28-10.dump
docker run --rm postgres:18-alpine psql "<URL do banco sem ?schema=…>" -c 'DROP SCHEMA IF EXISTS "animehub_archive" CASCADE;'
```

Depois, volte às imagens anteriores (`git checkout` do commit antigo, `build-images.sh`, `kubectl apply -k
deploy/k8s`) e suba o site de novo (`kubectl -n animehub scale deploy --all --replicas=1`).

## Banco novo: o primeiro administrador

Num banco vazio não há quem crie contas. O comando abaixo cria o primeiro administrador, com senha provisória
mostrada uma vez, e **recusa se o banco já tem administrador**. Ele roda dentro do cluster, com a imagem de migração:

```bash
kubectl -n animehub run criar-admin --rm -it --restart=Never --image=animehub/migrate:latest --image-pull-policy=Never \
  --overrides='{"spec":{"containers":[{"name":"criar-admin","image":"animehub/migrate:latest","imagePullPolicy":"Never","stdin":true,"tty":true,"envFrom":[{"secretRef":{"name":"animehub-env"}}],"command":["node","scripts/criar-primeiro-admin.mjs","--email","voce@exemplo.com","--nome","Seu Nome","--usuario","seu_usuario"]}]}}'
```

No Windows, com `ANIME_HUB_DATABASE_URL` apontando para o banco: `npm run admin:primeiro -- --email voce@exemplo.com
--nome "Seu Nome" --usuario seu_usuario`.

Os bancos atuais já têm administrador; para eles, o comando só confirma isso e não faz nada.
