#!/bin/bash
# Roda só na primeira inicialização do volume de dados do Postgres (padrão
# da imagem oficial pra scripts em /docker-entrypoint-initdb.d/). Cria o
# segundo banco usado pela suíte Playwright — Postgres não recria bancos
# sob demanda como o SQLite fazia com o arquivo .db.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE animehub_test;
EOSQL
