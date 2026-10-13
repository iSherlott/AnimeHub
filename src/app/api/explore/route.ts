import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAiringToday, loadStories, validTimeZone } from "@/lib/exploreSections";

const MAX_RECENT = 12;

/**
 * Fileiras do Explorar que dependem de quem olha. `tz` é o fuso da pessoa (define "hoje") e `recent` são as últimas
 * obras que ela abriu (só o navegador sabe; vale para quem não entrou). Leitura pública.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const params = request.nextUrl.searchParams;
  const timeZone = validTimeZone(params.get("tz")) ?? "UTC";
  const recentIds = (params.get("recent") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_RECENT);

  const [today, stories] = await Promise.all([loadAiringToday(timeZone, user?.id ?? null), loadStories({ userId: user?.id ?? null, recentIds })]);
  return NextResponse.json({ today, stories, personalized: Boolean(user) });
}
