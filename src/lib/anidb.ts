import { XMLParser } from "fast-xml-parser";

// API HTTP oficial da AniDB — não é scraping, é o endpoint documentado em
// https://wiki.anidb.net/HTTP_API_Definition. Exige um client registrado
// (nome + versão aprovados na conta AniDB de quem for usar); sem isso a
// própria AniDB rejeita a chamada com <error code="302">. Por isso o client
// name/version vêm de variável de ambiente — sem eles, nem tentamos a
// chamada (evita gastar tentativas contra um client não registrado, o que
// a documentação deles trata como abuso).
const ANIDB_HTTP_API_URL = "http://api.anidb.net:9001/httpapi";
const ANIDB_CLIENT_NAME = process.env.ANIDB_CLIENT_NAME;
const ANIDB_CLIENT_VERSION = process.env.ANIDB_CLIENT_VERSION;

export function isAnidbConfigured(): boolean {
  return Boolean(ANIDB_CLIENT_NAME && ANIDB_CLIENT_VERSION);
}

export type AnidbAnime = {
  anidbId: number;
  titles: { language: string; title: string; isOfficial: boolean }[];
  picture: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  episodeCount: number | null;
  rating: number | null;
  ratingVotes: number | null;
  awards: string[];
  resources: Record<string, string>;
  episodes: {
    number: string;
    airDate: string | null;
    titles: { language: string; title: string }[];
  }[];
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Busca um anime pelo AID (ID numérico da AniDB) — precisa de client configurado. */
export async function getAnidbAnimeById(aid: number): Promise<AnidbAnime> {
  if (!isAnidbConfigured()) {
    throw new Error(
      "AniDB não configurada: defina ANIDB_CLIENT_NAME e ANIDB_CLIENT_VERSION (registre um client em anidb.net)"
    );
  }

  const url = `${ANIDB_HTTP_API_URL}?request=anime&client=${ANIDB_CLIENT_NAME}&clientver=${ANIDB_CLIENT_VERSION}&protover=1&aid=${aid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AniDB request failed (${res.status})`);
  }

  // A API da AniDB sempre responde com o corpo comprimido em gzip,
  // independente do Accept-Encoding enviado — o runtime do fetch já
  // descomprime automaticamente quando o header content-encoding vem
  // setado, então só precisamos ler o texto normalmente.
  const xml = await res.text();
  const data = parser.parse(xml);

  if (data.error) {
    const message = typeof data.error === "object" ? data.error["#text"] : data.error;
    throw new Error(`AniDB error: ${message ?? "unknown"}`);
  }

  const anime = data.anime;
  if (!anime) throw new Error("AniDB: resposta sem dados de anime");

  const titles = asArray(anime.titles?.title).map((t: any) => ({
    language: t["@_xml:lang"] ?? "unknown",
    title: t["#text"] ?? String(t),
    isOfficial: t["@_type"] === "official",
  }));

  const resources: Record<string, string> = {};
  for (const resource of asArray(anime.resources?.resource)) {
    const type = resource["@_type"];
    const externalEntity = asArray(resource.externalentity)[0];
    const url = externalEntity?.url;
    if (type && url) resources[type] = url;
  }

  const episodes = asArray(anime.episodes?.episode).map((ep: any) => ({
    number: ep.epno?.["#text"] ?? String(ep.epno ?? ""),
    airDate: ep.airdate ?? null,
    titles: asArray(ep.title).map((t: any) => ({
      language: t["@_xml:lang"] ?? "unknown",
      title: t["#text"] ?? String(t),
    })),
  }));

  return {
    anidbId: aid,
    titles,
    picture: anime.picture ? `https://cdn.anidb.net/images/main/${anime.picture}` : null,
    description: anime.description ?? null,
    startDate: anime.startdate ?? null,
    endDate: anime.enddate ?? null,
    episodeCount: anime.episodecount ? Number(anime.episodecount) : null,
    rating: anime.ratings?.permanent?.["#text"]
      ? Number(anime.ratings.permanent["#text"])
      : null,
    ratingVotes: anime.ratings?.permanent?.["@_count"]
      ? Number(anime.ratings.permanent["@_count"])
      : null,
    awards: asArray(anime.awards?.award).map((a: any) => a["#text"] ?? String(a)),
    resources,
    episodes,
  };
}
