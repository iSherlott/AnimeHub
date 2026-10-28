# deps: só instala pacotes — cacheia enquanto o lockfile não mudar.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# builder: gera o Prisma Client (já pro alvo linux do container) e o build
# standalone do Next. libssl precisa estar presente ANTES do `prisma
# generate` — sem isso a Prisma não detecta a versão certa do OpenSSL e cai
# num fallback ("openssl-1.1.x") que pode não bater com o runtime.
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_STANDALONE=true
# Folga de memória para o build (o padrão do Node no servidor ficava em ~2 GB). A checagem de tipos aqui usa
# tsconfig.build.json (sem os testes): ver next.config.ts.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build

# runner: imagem final enxuta — só o output standalone + o Prisma Client
# gerado (a árvore de arquivos do Next não rastreia o binário nativo do
# engine da Prisma, por isso é copiado à parte). Também precisa do libssl
# em runtime pra carregar o binário do engine corretamente.
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Docker define HOSTNAME=<container id> automaticamente, e o server.js do
# output standalone do Next usa process.env.HOSTNAME (quando definido) como
# endereço de bind — sem isso o servidor escuta só no IP interno do
# container, nunca em todas as interfaces, e o port forwarding do Docker
# nunca alcança ele (ECONNREFUSED de fora e até de dentro via localhost).
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Dicionário do kuromoji (kana/furigana dos títulos): o rastreio do standalone não inclui os .dat.gz,
# e o kuroshiro os abre por caminho relativo (node_modules/kuromoji/dict) — sem isto /api/readings volta vazio.
COPY --from=builder /app/node_modules/kuromoji/dict ./node_modules/kuromoji/dict
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
