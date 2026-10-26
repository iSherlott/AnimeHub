import { notFound, permanentRedirect } from "next/navigation";

/**
 * O detalhe de toda obra mora em `/anime/<id>` (o mesmo desenho para quem acompanha e para quem ainda não). Este endereço
 * antigo só encaminha, mantendo a âncora (#discussoes) que alguns links usam.
 */
export default async function ObraRedirect({ params }: { params: Promise<{ anilistId: string }> }) {
  const { anilistId } = await params;
  if (!(/^\d{1,9}$/.test(anilistId) && Number(anilistId) > 0) && !/^(anidb|kitsu)-\d{1,9}$/.test(anilistId)) notFound();
  permanentRedirect(`/anime/${anilistId}`);
}
