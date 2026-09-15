-- Episode.number reinicia a cada temporada dentro do mesmo anime (ver
-- comentário do campo no schema) — a constraint antiga (animeId, number)
-- tratava S1E1 e S2E1 como o mesmo episódio, causando dedup silenciosa de
-- temporadas inteiras no passo da Kitsu (src/lib/episodes.ts) sempre que a
-- numeração local colidia com uma temporada anterior (achado real da 13ª
-- rodada de auditoria, Epic 18).
DROP INDEX "Episode_animeId_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "Episode_animeId_seasonNumber_number_key" ON "Episode"("animeId", "seasonNumber", "number");
