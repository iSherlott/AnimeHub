/**
 * Wrapper fino em cima de POST /api/uploads (Epic 26) — usado pelo
 * compositor do Feed pra anexar imagem de verdade em vez de colar URL.
 */
export async function uploadImage(file: File): Promise<{ url: string; width: number; height: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Falha ao enviar imagem");
  }
  return data;
}
