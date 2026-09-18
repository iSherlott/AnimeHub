import path from "node:path";

/**
 * Raiz de armazenamento dos uploads (Epic 26) — FORA de `public/` de
 * propósito. `next start` (produção) não serve dinamicamente arquivo
 * novo criado em `public/` depois que o servidor já subiu — só o que já
 * existia lá no momento do boot (confirmado ao vivo: escrever um arquivo
 * em `public/` depois do `next start` já rodando devolve 404 pra ele,
 * mesmo existindo no disco — `next dev` mascara isso, porque o dev
 * server SIM serve dinamicamente qualquer coisa em `public/`). Por isso
 * os uploads são servidos de volta por uma rota própria
 * (src/app/api/uploads/[...path]/route.ts), que lê do disco a cada
 * requisição, em vez de depender do serving estático embutido do Next.
 */
export const UPLOAD_STORAGE_ROOT = path.join(process.cwd(), "storage", "uploads");
