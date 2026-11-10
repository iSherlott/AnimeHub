/** Os tiers e o tipo de obra da tier list (o navegador também usa). Ver tierList.ts. */
export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];
export type TierWork = { key: string; titleRomaji: string; titleEnglish: string | null; coverImage: string | null };
