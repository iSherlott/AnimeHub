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
docker version                   # Docker para gerar as imagens (sudo apt install docker.io, se faltar)
```

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

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Pod em `ErrImageNeverPull` | A imagem não chegou ao cluster: rode o passo 5 de novo com o `IMPORT_TO` certo |
| `migrate` falha com "Can't reach database" | Endereço do passo 3 errado; teste com `kubectl -n animehub run pg --rm -it --image=postgres:16-alpine -- psql "<URL sem ?schema=…>"` |
| Login não "segura" | `SESSION_COOKIE_SECURE=false` faltando no env (passo 6) |
| `web` reinicia sem parar | `kubectl -n animehub logs deploy/web --previous`; quase sempre é a URL do banco |
| PVC em `Pending` | O cluster não tem StorageClass padrão: no microk8s, `microk8s enable hostpath-storage` |
