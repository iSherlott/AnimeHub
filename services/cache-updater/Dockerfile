# Build context é a raiz do repo (docker-compose.yml usa `context: .`).
# Mesmo padrão do calendar-loader pro Prisma: gera na raiz (onde a CLI
# espera) e copia o client pronto pra /app/node_modules — ancestral comum de
# /app/src/lib (que faz `@/lib/prisma`, `@/lib/anilist` etc.) e
# /app/services/cache-updater/src.
FROM node:20-slim AS prisma-deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# A ordem daqui pra baixo importa: src/ precisa acabar em /app/src (não em
# /app/services/cache-updater/src) porque src/lib/*.ts usa o alias
# "@/lib/...". O tsx resolve esse alias pelo tsconfig.json mais próximo do
# CWD no momento em que o processo sobe — por isso o CMD abaixo troca o
# WORKDIR pro diretório do serviço (onde está o tsconfig com
# baseUrl:"../.." + paths) antes de rodar, em vez de invocar
# `tsx caminho/relativo/longo` com CWD em /app (isso NÃO funciona: tsx não
# acharia nenhum tsconfig a partir de /app e todo import "@/..." quebra).
COPY src ./src
COPY --from=prisma-deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-deps /app/node_modules/@prisma/client ./node_modules/@prisma/client

WORKDIR /app/services/cache-updater
COPY services/cache-updater/package.json ./
RUN npm install
COPY services/cache-updater/tsconfig.json ./
COPY services/cache-updater/src ./src

ENV PORT=4003
EXPOSE 4003
CMD ["npm", "start"]
