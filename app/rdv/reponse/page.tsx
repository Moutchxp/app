import type { Metadata } from "next";
import { ReponseRdv } from "./ReponseRdv";

/**
 * ══ 🔴🔴 PAGE PUBLIQUE — LA RÉPONSE D'UN LOCATAIRE À UN RENDEZ-VOUS (Arno, 18/11/2026) ═══════════════════════════════════════════════════════
 * Ouverte par les boutons « J'accepte le rendez-vous » / « Je refuse » du mail d'invitation (pré-visite ou état des lieux de sortie). AUCUNE
 * connexion : le jeton du lien suffit (règles dans `app/api/rdv/reponse/route.ts`). L'ouverture n'enregistre RIEN : seul le bouton de la page
 * enregistre le choix. Mobile d'abord (iPhone en portrait), cibles de 44 px au moins.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votre rendez-vous — Sans Vis-à-Vis®",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function PageReponseRdv({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const jeton = typeof p.j === "string" ? p.j : "";
  const decision = p.d === "refuser" ? "refuser" : p.d === "accepter" ? "accepter" : null;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <ReponseRdv jeton={jeton} decision={decision} />
    </main>
  );
}
