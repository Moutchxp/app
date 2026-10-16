import type { Metadata } from "next";
import { ReponseTache } from "./ReponseTache";

/**
 * ══ 🔴🔴 LOT GESTION-ACCEPTATION (16/10/2026) — PAGE PUBLIQUE DE RÉPONSE À UNE TÂCHE CONFIÉE ═════════════════════════
 *
 * Ouverte par les boutons « Accepter » / « Refuser » du mail de demande. AUCUNE connexion : le jeton du lien suffit
 * (règles dans `app/api/tache/reponse/route.ts`). Plus aucune ouverture de la page de connexion de l'admin.
 * « Accepter » s'enregistre dès l'ouverture ; « Refuser » demande le motif (règle 4 du 13/10/2026).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Réponse à une tâche — Sans Vis-à-Vis®",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function PageReponseTache({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const jeton = typeof p.j === "string" ? p.j : "";
  const decision = p.d === "refuser" ? "refuser" : p.d === "accepter" ? "accepter" : null;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <ReponseTache jeton={jeton} decision={decision} />
    </main>
  );
}
