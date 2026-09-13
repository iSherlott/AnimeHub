# Build context é a raiz do repo (docker-compose.yml usa `context: .`).
# Sem Prisma aqui — esse serviço não toca no banco, só computação pura
# (série/temporada, fusão de gêneros, título por idioma, furigana).

# deps: instala só kuroshiro/kuroshiro-analyzer-kuromoji (não o node_modules
# inteiro da raiz) numa árvore isolada e própria — evita puxar Next.js,
# Prisma, Playwright etc. só pra achar 2 pacotes.
FROM node:20-slim AS deps
WORKDIR /app
RUN npm init -y && npm install kuroshiro@^1.2.0 kuroshiro-analyzer-kuromoji@^1.1.0

FROM node:20-slim AS runner
WORKDIR /app
# A ordem daqui pra baixo importa: src/ precisa acabar em /app/src (não em
# /app/services/name-resolver/src) porque src/lib/furigana.ts faz
# `import("kuroshiro")` a partir da SUA própria localização — o pacote
# precisa estar em /app/node_modules (ancestral comum de /app/src/lib e
# /app/services/name-resolver/src), não dentro do node_modules do serviço.
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules

# O CMD abaixo troca o WORKDIR pro diretório do serviço (onde está o
# tsconfig com baseUrl:"../.." + paths) antes de rodar — o tsx resolve alias
# "@/..." pelo tsconfig mais próximo do CWD no momento em que o processo
# sobe, então rodar com CWD em /app (sem tsconfig ali) quebraria qualquer
# import "@/..." dentro dos arquivos compartilhados de src/lib.
WORKDIR /app/services/name-resolver
COPY services/name-resolver/package.json ./
RUN npm install
COPY services/name-resolver/tsconfig.json ./
COPY services/name-resolver/src ./src

ENV PORT=4002
EXPOSE 4002
CMD ["npm", "start"]
