# Build context é a raiz do repo (docker-compose.yml usa `context: .`) —
# mesmo padrão do calendar-loader: gera o Prisma Client na raiz (onde a CLI
# espera) e copia o node_modules inteiro pro runner (evita o problema já
# visto no cache-updater de cherry-picking pacote por pacote quebrar toda
# vez que um novo import de src/lib aparece).
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
# src/ precisa acabar em /app/src (não em /app/services/notifier/src) —
# src/lib/prisma.ts usa o alias "@/lib/...", resolvido pelo tsconfig mais
# próximo do CWD quando o tsx sobe (por isso o CMD troca WORKDIR antes de
# rodar, em vez de invocar com um caminho relativo longo a partir de /app).
COPY src ./src
COPY --from=prisma-deps /app/node_modules ./node_modules

WORKDIR /app/services/notifier
COPY services/notifier/package.json ./
RUN npm install
COPY services/notifier/tsconfig.json ./
COPY services/notifier/src ./src

ENV PORT=4004
EXPOSE 4004
CMD ["npm", "start"]
