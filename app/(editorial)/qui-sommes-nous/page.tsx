import type { Metadata } from "next";
import { SectionEditoriale } from "../gabarit";
import { TITRE_PAGE, SECTIONS } from "./contenu";

// Page STATIQUE (aucun accès base). Rendue par le layout de segment (polices de marque + bandeau + retour).
export const metadata: Metadata = { title: `${TITRE_PAGE} — Sans Vis-à-Vis®` };

/**
 * Page « Qui sommes-nous » (Server Component, statique). STRUCTURE seule : titre + sections. Les textes viennent de
 * `./contenu.ts` ; tant qu'ils sont vides, chaque section affiche « Contenu à venir ».
 */
export default function QuiSommesNousPage() {
  return (
    <>
      <h1 className="svv-verif-title text-2xl font-extrabold text-svv-ink">{TITRE_PAGE}</h1>
      {SECTIONS.map((s, i) => (
        <SectionEditoriale key={i} titre={s.titre} corps={s.corps} />
      ))}
    </>
  );
}
