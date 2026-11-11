-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "tierListJson" TEXT;

-- Tier lists já publicadas: grava no post o quadro da tier list ligada a ele, com título e capa da obra na lista da pessoa.
UPDATE "Post" p
SET "tierListJson" = s.snapshot
FROM (
  SELECT t."postId",
    jsonb_build_object(
      'season', t."season",
      'seasonYear', t."seasonYear",
      'tiers', (
        SELECT jsonb_object_agg(tier.key, (
          SELECT coalesce(jsonb_agg(jsonb_build_object('key', k.value, 'title', coalesce(a."titleRomaji", k.value), 'cover', a."coverImage") ORDER BY k.ord), '[]'::jsonb)
          FROM jsonb_array_elements_text(tier.value) WITH ORDINALITY AS k(value, ord)
          LEFT JOIN LATERAL (
            SELECT an."titleRomaji", an."coverImage" FROM "Anime" an
            WHERE an."userId" = t."userId"
              AND (an."anilistId"::text = k.value OR ('anidb-' || an."anidbId"::text) = k.value OR an."id" = k.value)
            LIMIT 1
          ) a ON true
        ))
        FROM jsonb_each(t."tiersJson"::jsonb) AS tier
        WHERE jsonb_typeof(tier.value) = 'array'
      )
    )::text AS snapshot
  FROM "TierList" t
  WHERE t."postId" IS NOT NULL
) s
WHERE p."id" = s."postId" AND p."tierListJson" IS NULL;
