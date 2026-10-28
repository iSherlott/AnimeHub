#!/usr/bin/env bash
# Atualiza o Anime Hub no cluster do notebook, parando no PRIMEIRO erro. Rode da raiz do projeto:
#   bash deploy/k8s/atualizar.sh
#
# Por que um script: no deploy de 28/10 os comandos foram colados um por linha; o build da imagem do site falhou, mas os
# comandos seguintes rodaram assim mesmo — o Job de migração usou a imagem ANTIGA ("No pending migrations") e o site
# reiniciou com as imagens antigas. Aqui, qualquer falha interrompe tudo antes de mexer no banco ou no site.
set -euo pipefail

cd "$(dirname "$0")/../.."
TAG="${TAG:-latest}"
NS=animehub

passo() { printf '\n==> %s\n' "$1"; }
falha() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

passo "1/6 Backup"
if [ "${BACKUP_FEITO:-}" != "1" ]; then
  read -r -p "O backup do schema animehub (passo 2 do checklist) já foi feito? [s/N] " resposta
  [ "$resposta" = "s" ] || [ "$resposta" = "S" ] || falha "Faça o backup antes (deploy/k8s/checklist-atualizacao-28-10.md, passo 2)."
fi

passo "2/6 Código"
git pull --ff-only
# Mesmo jeito de listar aqui e dentro da imagem (sem depender de apelidos do `ls`).
LISTAR='for d in prisma/migrations/*/; do basename "$d"; done | sort | tail -1'
esperada=$(sh -c "$LISTAR")
echo "Última migração do código: $esperada"

passo "3/6 Imagens (demora; o build do site leva alguns minutos)"
bash deploy/k8s/build-images.sh

passo "4/6 Conferir a imagem de migração"
na_imagem=$(docker run --rm --entrypoint sh "animehub/migrate:$TAG" -c "$LISTAR")
echo "Última migração na imagem: $na_imagem"
[ "$na_imagem" = "$esperada" ] || falha "A imagem de migração não é a deste código ($na_imagem ≠ $esperada). Nada foi migrado."

passo "5/6 Migração do banco"
kubectl -n "$NS" delete job animehub-migrate --ignore-not-found
kubectl apply -f deploy/k8s/migrate-job.yaml
if ! kubectl -n "$NS" wait --for=condition=complete job/animehub-migrate --timeout=600s; then
  kubectl -n "$NS" logs job/animehub-migrate --tail=40 || true
  falha "A migração não terminou. O site NÃO foi trocado (continua na versão anterior)."
fi
kubectl -n "$NS" logs job/animehub-migrate | tail -3

passo "6/6 Site e serviços"
kubectl apply -k deploy/k8s
kubectl -n "$NS" rollout restart deploy
kubectl -n "$NS" rollout status deploy/web --timeout=300s

printf '\n✓ Atualizado. Agora rode a conferência (passo 4 do checklist):\n'
printf '  docker run --rm -v "$PWD:/w" postgres:18-alpine psql "<URL do banco sem ?schema=…>" -f /w/deploy/k8s/conferir-atualizacao.sql\n\n'
