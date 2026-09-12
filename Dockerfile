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
RUN npm run build

# runner: imagem final enxuta — só o output standalone + o Prisma Client
# gerado (a árvore de arquivos do Next não rastreia o binário nativo do
# engine da Prisma, por isso é copiado à parte). Também precisa do libssl
# em runtime pra carregar o binário do engine corretamente.
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
