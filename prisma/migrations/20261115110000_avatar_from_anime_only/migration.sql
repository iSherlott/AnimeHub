-- Avatar só de anime (decisão de 26/10/2026, ADR 0012): o envio de foto própria saiu, e quem tinha foto enviada volta às
-- iniciais até escolher uma imagem de um anime que acompanha. Só zera a referência; os arquivos enviados continuam em
-- storage/uploads/avatars (nada é apagado do disco). A capa nunca aceitou foto própria.
UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" LIKE '%/api/uploads/avatars/%';
