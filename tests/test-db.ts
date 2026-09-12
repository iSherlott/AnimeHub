// Mesmo usuário/senha do Postgres local (docker-compose.yml / .env) — só
// muda o nome do banco. É a mesma instância Postgres, então a suíte usa o
// banco `animehub_test` (criado pelo docker/init-test-db.sh) em vez de
// `animehub`, mantendo os dados de dev intactos entre as rodadas de teste.
export const TEST_DB_URL =
  "postgresql://animehub:animehub_dev_local@localhost:5432/animehub_test?schema=public";
