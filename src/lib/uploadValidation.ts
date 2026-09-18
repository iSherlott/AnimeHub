/**
 * Partes puras da validação de upload (Epic 26) — separadas da rota
 * (src/app/api/uploads/route.ts) pra dar pra testar sem precisar montar
 * um multipart de verdade.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

/** Limite pro Content-Length CRU da requisição (arquivo + overhead do
 * multipart — boundary/headers, tipicamente poucos KB) — checado ANTES
 * de `request.formData()` ler o corpo inteiro pra memória. Sem isso,
 * `isWithinMaxSize` só rejeita depois que o corpo inteiro já foi
 * bufferizado — um POST de centenas de MB (autenticado, mas ainda assim)
 * já teria gastado toda essa memória antes da checagem de tamanho do
 * arquivo em si sequer rodar. */
export const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

/** Formatos que o sharp consegue decodificar e que faz sentido aceitar de
 * um usuário colando/anexando uma foto — SVG fica de fora de propósito
 * (pode carregar script, e o sharp não rasteriza sem libvips com suporte
 * a rsvg de qualquer forma). */
export const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "webp", "gif", "avif"] as const;
export type AllowedImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

export function isAllowedImageFormat(format: string | undefined): format is AllowedImageFormat {
  return ALLOWED_IMAGE_FORMATS.includes(format as AllowedImageFormat);
}

export function isWithinMaxSize(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= MAX_UPLOAD_BYTES;
}
