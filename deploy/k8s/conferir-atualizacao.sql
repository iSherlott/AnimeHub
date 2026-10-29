-- Conferência depois da atualização de 28/10/2026 (29 migrações, de 20261025100000 a 20261121100000).
-- Rode com:  psql "<URL do banco sem ?schema=…>" -f deploy/k8s/conferir-atualizacao.sql
-- Cada linha traz o que se espera ao lado (no ensaio numa cópia do banco de 26/10, todas bateram).

select 'migrações aplicadas (espera 76)' as conferencia, count(*)::text as valor
  from animehub._prisma_migrations where finished_at is not null and rolled_back_at is null
union all select 'migrações com falha (espera 0)', count(*)::text
  from animehub._prisma_migrations where finished_at is null or rolled_back_at is not null
union all select 'última migração (espera 20261121100000_image_size)', max(migration_name)
  from animehub._prisma_migrations
union all select 'itens de lista sem obra do catálogo (espera 0)', count(*)::text
  from animehub."Anime" where "catalogEntryId" is null
union all select 'produções sem obra do catálogo (espera 0)', count(*)::text
  from animehub."Production" where "catalogEntryId" is null
union all select 'tabelas guardadas em animehub_archive (espera 2)', count(*)::text
  from information_schema.tables where table_schema = 'animehub_archive'
union all select 'administradores (espera 1 ou mais)', count(*)::text
  from animehub."User" where role = 'ADMIN'
union all select 'contas com senha provisória (espera 0)', count(*)::text
  from animehub."User" where "mustChangePassword"
union all select 'avatares que não são de anime (espera 0)', count(*)::text
  from animehub."User" where "avatarUrl" is not null and "avatarUrl" like '%/api/uploads/%'
union all select 'contas sem nome de usuário (informativo; defina em Admin → Acesso)', count(*)::text
  from animehub."User" where handle is null
union all select 'gêneros não registrados (espera vazio; se vier algum, resolva em Admin → Taxonomia)', coalesce(string_agg(key, ', '), '')
  from animehub."Genre" where not registered;
