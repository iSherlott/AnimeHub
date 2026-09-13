# Build context é a raiz do repo (docker-compose.yml usa `context: .`) —
# precisa alcançar prisma/schema.prisma e src/lib/*.ts compartilhados.

# prisma-deps: gera o Prisma Client exatamente como o Dockerfile principal já
# faz (raiz do projeto = raiz do schema) — a CLI da Prisma infere a "raiz do
# projeto" a partir da localização do schema, não do CWD, então gerar de
# dentro do subdiretório do serviço (com --schema=../../prisma/schema.prisma)
# faz ela instalar/gerar no lugar errado. Mais simples: gerar aqui, do jeito
# que já funciona, e copiar o client pronto pro serviço depois.
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
# /app/services/calendar-loader/src) porque src/lib/*.ts usa o alias
# "@/lib/..." — o tsconfig.json do serviço resolve esse alias via
# baseUrl:"../.." + paths (o tsx lê isso em runtime), que só bate com
# /app/src se o WORKDIR ainda for /app quando este COPY roda.
COPY src ./src
COPY --from=prisma-deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-deps /app/node_modules/@prisma/client ./node_modules/@prisma/client

WORKDIR /app/services/calendar-loader
COPY services/calendar-loader/package.json ./
RUN npm install
COPY services/calendar-loader/tsconfig.json ./
COPY services/calendar-loader/src ./src

ENV PORT=4001
EXPOSE 4001
CMD ["npm", "start"]
