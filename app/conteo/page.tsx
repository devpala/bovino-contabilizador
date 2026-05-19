import { CountingPage } from "@/components/counting-page";
import { getCountingSessions } from "@/lib/counting";
import { getDashboardData } from "@/lib/records";
import type { CountingSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConteoRoute() {
  const [data, sessions] = await Promise.all([getDashboardData(), getCountingSessions()]);

  const sessionsByEstablishment: Record<string, CountingSession[]> = {};
  for (const establishment of data.establishments) {
    sessionsByEstablishment[establishment.id] = [];
  }
  for (const session of sessions) {
    const bucket = sessionsByEstablishment[session.establishmentId];
    if (bucket) bucket.push(session);
    else sessionsByEstablishment[session.establishmentId] = [session];
  }

  return (
    <main className="page-shell">
      <CountingPage
        establishments={data.establishments}
        sessionsByEstablishment={sessionsByEstablishment}
      />
    </main>
  );
}
