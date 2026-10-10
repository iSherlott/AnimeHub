# Build context é a raiz do repo (docker-compose.yml usa `context: .`).
# Mesmo padrão do calendar-loader pro Prisma: gera na raiz (onde a CLI
# espera). Copia o node_modules INTEIRO pro runner (não só .prisma/@prisma
# client) — news-fetcher importa cada vez mais de src/lib (anidb.ts usa
# fast-xml-parser, por exemplo) e cherry-picking pacote por pacote quebra
# silenciosamente toda vez que um novo import aparece. Já pagamos o custo
# do `npm ci` completo pra gerar o Prisma Client mesmo, então copiar tudo
# não tem custo extra de build, só de tamanho de imagem — aceitável aqui.
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
# /app/services/news-fetcher/src) porque src/lib/*.ts usa o alias
# "@/lib/...". O tsx resolve esse alias pelo tsconfig.json mais próximo do
# CWD no momento em que o processo sobe — por isso o CMD abaixo troca o
# WORKDIR pro diretório do serviço (onde está o tsconfig com
# baseUrl:"../.." + paths) antes de rodar, em vez de invocar
# `tsx caminho/relativo/longo` com CWD em /app (isso NÃO funciona: tsx não
# acharia nenhum tsconfig a partir de /app e todo import "@/..." quebra).
COPY src ./src
COPY --from=prisma-deps /app/node_modules ./node_modules

WORKDIR /app/services/news-fetcher
COPY services/news-fetcher/package.json ./
RUN npm install
COPY services/news-fetcher/tsconfig.json ./
COPY services/news-fetcher/src ./src

ENV PORT=4005
EXPOSE 4005
CMD ["npm", "start"]
