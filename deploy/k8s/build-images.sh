#!/usr/bin/env bash
# Gera as 7 imagens do Anime Hub no notebook e as entrega ao Kubernetes (os manifestos usam imagePullPolicy: Never,
# sem registry). Rode da raiz do projeto: `bash deploy/k8s/build-images.sh`.
#
# Para onde vão as imagens (IMPORT_TO): k3s, microk8s, containerd (kubeadm com containerd) ou docker (cluster que
# usa o próprio Docker, como o Docker Desktop/minikube com driver docker). Sem a variável, o script tenta descobrir.
set -euo pipefail

cd "$(dirname "$0")/../.."
TAG="${TAG:-latest}"

if [ -z "${IMPORT_TO:-}" ]; then
  if command -v k3s >/dev/null 2>&1; then IMPORT_TO=k3s
  elif command -v microk8s >/dev/null 2>&1; then IMPORT_TO=microk8s
  elif command -v ctr >/dev/null 2>&1; then IMPORT_TO=containerd
  else IMPORT_TO=docker
  fi
fi
echo "Imagens vão para: $IMPORT_TO (tag $TAG)"

build() { # nome, alvo/Dockerfile
  echo "==> animehub/$1:$TAG"
  docker build "${@:2}" -t "animehub/$1:$TAG" .
}

build web --target runner
build migrate --target builder
for svc in calendar-loader name-resolver cache-updater notifier news-fetcher; do
  build "$svc" -f "services/$svc/Dockerfile"
done

images=(web migrate calendar-loader name-resolver cache-updater notifier news-fetcher)
refs=()
for i in "${images[@]}"; do refs+=("animehub/$i:$TAG"); done

case "$IMPORT_TO" in
  k3s) docker save "${refs[@]}" | sudo k3s ctr images import - ;;
  microk8s) docker save "${refs[@]}" | microk8s ctr image import - ;;
  containerd) docker save "${refs[@]}" | sudo ctr -n k8s.io images import - ;;
  docker) echo "O cluster usa o Docker: as imagens já estão lá." ;;
  *) echo "IMPORT_TO desconhecido: $IMPORT_TO" >&2; exit 1 ;;
esac
echo "Pronto: ${refs[*]}"
