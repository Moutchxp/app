import type { Metadata } from "next";
import { ListePartenaires, MSG_CONTENU_A_VENIR } from "../gabarit";
import { TITRE_PAGE, INTRO, PARTENAIRES } from "./contenu";

// Page STATIQUE (aucun accès base). Rendue par le layout de segment (polices de marque + bandeau + retour).
export const metadata: Metadata = { title: `${TITRE_PAGE} — Sans Vis-à-Vis®` };

/**
 * Page « Partenaires » (Server Component, statique). STRUCTURE seule : titre + introduction + liste rendue depuis les
 * données (`./contenu.ts`). Introduction vide → « Contenu à venir » ; liste vide → état vide explicite.
 */
export default function PartenairesPage() {
  return (
    <>
      <h1 className="svv-verif-title text-2xl font-extrabold text-svv-ink">{TITRE_PAGE}</h1>
      {INTRO.trim() !== "" ? (
        <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-svv-ink">{INTRO}</p>
      ) : (
        <p className="text-sm italic text-svv-muted">{MSG_CONTENU_A_VENIR}</p>
      )}
      <ListePartenaires partenaires={PARTENAIRES} />
    </>
  );
}
