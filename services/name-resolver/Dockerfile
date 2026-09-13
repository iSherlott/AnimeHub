# Build context é a raiz do repo (docker-compose.yml usa `context: .`).
# Sem Prisma aqui — esse serviço não toca no banco, só computação pura
# (série/temporada, fusão de gêneros, título por idioma, furigana).
#
# `npm install` roda com WORKDIR /app (não em services/name-resolver) de
# propósito: src/lib/furigana.ts faz `import("kuroshiro")` a partir da SUA
# própria localização (/app/src/lib/), então o pacote precisa acabar em
# /app/node_modules (ancestral comum de /app/src/lib e
# /app/services/name-resolver/src) — instalar só dentro de
# services/name-resolver/node_modules não seria enxergado por esse import.
FROM node:20-slim
WORKDIR /app
COPY src ./src
COPY services/name-resolver/package.json ./package.json
RUN npm install
COPY services/name-resolver/tsconfig.json ./services/name-resolver/tsconfig.json
COPY services/name-resolver/src ./services/name-resolver/src

ENV PORT=4002
EXPOSE 4002
CMD ["npx", "tsx", "services/name-resolver/src/index.ts"]
