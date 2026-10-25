import { prisma } from "@/lib/prisma";

/**
 * Verificações de integridade do catálogo (Fase 2, ADR 0008). O banco garante o vínculo novo (`catalogEntryId`, com chave
 * estrangeira); estas consultas acham o que a chave não cobre: linha ainda sem vínculo, vínculo que diverge do anilistId,
 * órfão pelo identificador externo e duplicidade. Cada verificação diz se o problema aparece na tela.
 */
export type IntegrityCheck = {
  key: string;
  label: string;
  /** "public": afeta o que as pessoas veem; "schedule": agenda e avisos; "data": qualidade; "info": só informativo. */
  impact: "public" | "schedule" | "data" | "info";
  count: number;
  hint: string;
};

type Def = Omit<IntegrityCheck, "count"> & { sql: string };

const DEFS: Def[] = [
  { key: "schedule_without_catalog", label: "Episódios da agenda de obra fora do catálogo", impact: "schedule", hint: "a agenda tem a obra, o catálogo não; o calendário não a mostra", sql: `SELECT count(*)::int AS n FROM "AiringScheduleEntry" s WHERE NOT EXISTS (SELECT 1 FROM "CatalogEntry" c WHERE c."anilistId" = s."anilistId")` },
  { key: "schedule_unlinked", label: "Episódios da agenda sem vínculo com a obra", impact: "schedule", hint: "corrigível com \"Ligar ao catálogo\"", sql: `SELECT count(*)::int AS n FROM "AiringScheduleEntry" s JOIN "CatalogEntry" c ON c."anilistId" = s."anilistId" WHERE s."catalogEntryId" IS NULL` },
  { key: "schedule_mismatch", label: "Episódios ligados à obra errada", impact: "schedule", hint: "o vínculo aponta uma obra com outro AniList ID", sql: `SELECT count(*)::int AS n FROM "AiringScheduleEntry" s JOIN "CatalogEntry" c ON c."id" = s."catalogEntryId" WHERE c."anilistId" IS DISTINCT FROM s."anilistId"` },
  { key: "list_unlinked", label: "Itens de lista sem vínculo com a obra", impact: "public", hint: "corrigível com \"Ligar ao catálogo\"", sql: `SELECT count(*)::int AS n FROM "Anime" a JOIN "CatalogEntry" c ON c."anilistId" = a."anilistId" WHERE a."catalogEntryId" IS NULL` },
  { key: "list_mismatch", label: "Itens de lista ligados à obra errada", impact: "public", hint: "o vínculo aponta uma obra com outro AniList ID", sql: `SELECT count(*)::int AS n FROM "Anime" a JOIN "CatalogEntry" c ON c."id" = a."catalogEntryId" WHERE c."anilistId" IS DISTINCT FROM a."anilistId"` },
  { key: "list_without_catalog", label: "Itens de lista de obra fora do catálogo", impact: "public", hint: "a obra sumiu do catálogo; a página dela não abre", sql: `SELECT count(*)::int AS n FROM "Anime" a WHERE NOT EXISTS (SELECT 1 FROM "CatalogEntry" c WHERE c."anilistId" = a."anilistId")` },
  { key: "list_offplatform", label: "Itens de lista de obra que saiu da plataforma", impact: "public", hint: "decidir: trazer de volta ou tirar da lista", sql: `SELECT count(*)::int AS n FROM "Anime" a JOIN "CatalogEntry" c ON c."anilistId" = a."anilistId" WHERE c."onPlatform" = false` },
  { key: "production_unlinked", label: "Produções sem vínculo com a obra", impact: "public", hint: "corrigível com \"Ligar ao catálogo\"", sql: `SELECT count(*)::int AS n FROM "Production" p JOIN "CatalogEntry" c ON c."anilistId" = p."anilistId" WHERE p."catalogEntryId" IS NULL` },
  { key: "production_without_catalog", label: "Produções de obra fora do catálogo", impact: "public", hint: "a página pública existe sem obra no catálogo", sql: `SELECT count(*)::int AS n FROM "Production" p WHERE NOT EXISTS (SELECT 1 FROM "CatalogEntry" c WHERE c."anilistId" = p."anilistId")` },
  { key: "alerts_without_catalog", label: "Avisos do sino de obra fora do catálogo", impact: "schedule", hint: "aviso sem obra para abrir", sql: `SELECT count(*)::int AS n FROM "AiringAlert" a WHERE NOT EXISTS (SELECT 1 FROM "CatalogEntry" c WHERE c."anilistId" = a."anilistId")` },
  { key: "duplicate_title", label: "Obras repetidas (mesmo título, ano e formato) na plataforma", impact: "public", hint: "revisar em Correspondências", sql: `SELECT count(*)::int AS n FROM (SELECT 1 FROM "CatalogEntry" WHERE "onPlatform" GROUP BY lower("titleRomaji"), "seasonYear", "format" HAVING count(*) > 1) x` },
  { key: "anidb_only", label: "Obras na plataforma sem AniList ID", impact: "info", hint: "têm identidade interna; agenda e lista dependem de fonte com horário", sql: `SELECT count(*)::int AS n FROM "CatalogEntry" WHERE "anilistId" IS NULL AND "onPlatform"` },
];

export async function runIntegrityChecks(): Promise<IntegrityCheck[]> {
  const results = await Promise.all(DEFS.map(async (d) => ((await prisma.$queryRawUnsafe<Array<{ n: number }>>(d.sql))[0]?.n ?? 0)));
  return DEFS.map(({ sql: _sql, ...d }, i) => {
    void _sql;
    return { ...d, count: Number(results[i]) };
  });
}
