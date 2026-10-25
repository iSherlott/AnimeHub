import { XMLParser } from "fast-xml-parser";

// API HTTP oficial da AniDB — não é scraping, é o endpoint documentado em
// https://wiki.anidb.net/HTTP_API_Definition. Exige um client registrado
// (nome + versão aprovados na conta AniDB de quem for usar); sem isso a
// própria AniDB rejeita a chamada com <error code="302">. Por isso o client
// name/version vêm de variável de ambiente — sem eles, nem tentamos a
// chamada (evita gastar tentativas contra um client não registrado, o que
// a documentação deles trata como abuso).
// Sobrescrevível só para testes (um AniDB falso local): nunca bater no AniDB real fora do uso normal.
const ANIDB_HTTP_API_URL = process.env.ANIDB_HTTP_API_URL || "http://api.anidb.net:9001/httpapi";
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

// fast-xml-parser (with ignoreAttributes: false) represents an XML element
// either as a bare value (string, or number when the text looks numeric)
// when it has no attributes, or as an object with a "#text" key plus
// "@_"-prefixed attribute keys when it does. These types model exactly that
// duality for each element shape this parser actually consumes, instead of
// falling back to `any`.
type XmlValue = string | number;
type AnidbTitleNode = XmlValue | { "@_xml:lang"?: string; "@_type"?: string; "#text"?: XmlValue };
type AnidbEpisodeTitleNode = XmlValue | { "@_xml:lang"?: string; "#text"?: XmlValue };
type AnidbEpnoNode = XmlValue | { "@_type"?: string; "#text"?: XmlValue };
type AnidbAwardNode = XmlValue | { "#text"?: XmlValue };
type AnidbPermanentRatingNode = XmlValue | { "@_count"?: XmlValue; "#text"?: XmlValue };

type AnidbResourceNode = {
  "@_type"?: string;
  externalentity?: { url?: XmlValue } | { url?: XmlValue }[];
};

type AnidbEpisodeNode = {
  epno?: AnidbEpnoNode;
  airdate?: string;
  title?: AnidbEpisodeTitleNode | AnidbEpisodeTitleNode[];
};

type AnidbAnimeNode = {
  picture?: string;
  description?: string;
  startdate?: string;
  enddate?: string;
  episodecount?: XmlValue;
  titles?: { title?: AnidbTitleNode | AnidbTitleNode[] };
  resources?: { resource?: AnidbResourceNode | AnidbResourceNode[] };
  awards?: { award?: AnidbAwardNode | AnidbAwardNode[] };
  episodes?: { episode?: AnidbEpisodeNode | AnidbEpisodeNode[] };
  ratings?: { permanent?: AnidbPermanentRatingNode };
};

type AnidbXmlDocument = {
  error?: string | { "#text"?: string; "@_code"?: string };
  anime?: AnidbAnimeNode;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: XmlValue | { "#text"?: XmlValue } | undefined): string {
  if (node == null) return "";
  return String(typeof node === "object" ? node["#text"] ?? "" : node);
}

function numberOf(node: XmlValue | { "#text"?: XmlValue } | undefined): number | null {
  const value = typeof node === "object" ? node?.["#text"] : node;
  return value != null ? Number(value) : null;
}

function mapTitle(node: AnidbTitleNode): { language: string; title: string; isOfficial: boolean } {
  if (typeof node === "object") {
    return {
      language: node["@_xml:lang"] ?? "unknown",
      title: textOf(node),
      isOfficial: node["@_type"] === "official",
    };
  }
  // Defensive only — real AniDB <title> elements always carry xml:lang, so
  // this bare-primitive branch shouldn't be reachable in practice.
  return { language: "unknown", title: String(node), isOfficial: false };
}

function mapEpisodeTitle(node: AnidbEpisodeTitleNode): { language: string; title: string } {
  if (typeof node === "object") {
    return { language: node["@_xml:lang"] ?? "unknown", title: textOf(node) };
  }
  return { language: "unknown", title: String(node) };
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
  const data = parser.parse(xml) as AnidbXmlDocument;

  if (data.error) {
    const message = typeof data.error === "object" ? data.error["#text"] : data.error;
    throw new Error(`AniDB error: ${message ?? "unknown"}`);
  }

  const anime = data.anime;
  if (!anime) throw new Error("AniDB: resposta sem dados de anime");

  const titles = asArray(anime.titles?.title).map(mapTitle);

  const resources: Record<string, string> = {};
  for (const resource of asArray(anime.resources?.resource)) {
    const type = resource["@_type"];
    const externalEntity = asArray(resource.externalentity)[0];
    const url = externalEntity?.url;
    if (type && url != null) resources[type] = String(url);
  }

  const episodes = asArray(anime.episodes?.episode).map((ep) => ({
    number: textOf(ep.epno),
    airDate: ep.airdate ?? null,
    titles: asArray(ep.title).map(mapEpisodeTitle),
  }));

  return {
    anidbId: aid,
    titles,
    picture: anime.picture ? `https://cdn.anidb.net/images/main/${anime.picture}` : null,
    description: anime.description ?? null,
    startDate: anime.startdate ?? null,
    endDate: anime.enddate ?? null,
    episodeCount: anime.episodecount != null ? Number(anime.episodecount) : null,
    rating: numberOf(anime.ratings?.permanent),
    ratingVotes:
      typeof anime.ratings?.permanent === "object"
        ? numberOf(anime.ratings.permanent["@_count"])
        : null,
    awards: asArray(anime.awards?.award).map(textOf),
    resources,
    episodes,
  };
}
