import type { StoryMarkers } from "@/components/StoryMarkers";
import type { StoryRelation } from "./context";

/** Os pontos de virada da linha do tempo dos episódios: onde o reboot passa da versão antiga e onde a versão antiga passa o bastão. */
export function storyMarkersOf(relations: ReadonlyArray<StoryRelation>): StoryMarkers {
  const markers: StoryMarkers = { beyondFrom: null, continuesIn: null };
  for (const r of relations) {
    if (r.coverage !== "PARTIAL" || r.beyondFromEpisode === null) continue;
    if (r.role === "REBOOT") markers.beyondFrom = { episode: r.beyondFromEpisode, originalId: r.other.anilistId, originalTitle: r.other.titleRomaji };
    else markers.continuesIn = { anilistId: r.other.anilistId, title: r.other.titleRomaji, fromEpisode: r.beyondFromEpisode, arcName: r.beyondArc ? (r.beyondArc.namePt ?? r.beyondArc.nameEn) : null };
  }
  return markers;
}
