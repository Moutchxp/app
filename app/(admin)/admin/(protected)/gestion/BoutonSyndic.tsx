'use client';

import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { cleImmeuble } from '../../../../lib/gestion/syndics';
import { FicheSyndic } from './FicheSyndic';
import { useImmeublesSyndics } from './useImmeublesSyndics';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — LE BOUTON SYNDIC DE LA CARTE D'UN BIEN ═══════════════════════════
 *
 * ARNO : « Bouton sur la carte bien, à la place de la ligne SURFACE, même format que le bouton “Historique”, pleine
 * largeur, texte centré. Syndic connu pour la copropriété du bien : fond ROSE transparent, “Coordonnées syndic” →
 * ouvre la fiche syndic. Inconnu : fond BLANC, “Créer le syndic” → modale de création. »
 *
 * 🔴 « CONNU » SE LIT PAR L'IMMEUBLE DU LOT (la colonne « Immeuble » de WIPPIMMO, normalisée) : c'est la seule
 * clé de copropriété qui existe. Un lot sans immeuble n'a donc jamais de syndic « connu » ; son bouton dit « Créer
 * le syndic », et la fiche explique pourquoi elle ne peut rien pré-remplir.
 *
 * ⚠️ RIEN N'APPARAÎT tant que la migration 324 n'est pas appliquée, ni avant la première lecture : un bouton qui
 * dirait « Créer » pendant une fraction de seconde puis « Coordonnées » se lirait comme une erreur.
 */

/** Le composeur « écrire depuis gestion@ », fourni par l'écran qui le possède (l'Annuaire). */
export const EcrireDepuisGestion = createContext<((email: string) => void) | undefined>(undefined);

export function BoutonSyndic({ immeuble }: { immeuble: string | null | undefined }) {
  const etat = useImmeublesSyndics();
  const onEcrire = useContext(EcrireDepuisGestion);
  const [ouvert, setOuvert] = useState(false);
  if (etat === null || !etat.disponible) return null;
  const cle = cleImmeuble(immeuble);
  const syndic = cle === '' ? null : (etat.immeubles.find((i) => i.cle === cle)?.syndic ?? null);
  return (
    <>
      <style>{CSS_BOUTON_SYNDIC}</style>
      <button type="button"
        className={`svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large bsy${syndic !== null ? ' bsy--connu' : ''}`}
        title={syndic !== null ? `Syndic : ${syndic.nom}` : 'Aucun syndic connu pour cet immeuble'}
        onClick={() => setOuvert(true)}>
        {syndic !== null ? 'Coordonnées syndic' : 'Créer le syndic'}
      </button>
      {/* ⚠️ DANS UN PORTAIL : la carte peut porter une transformation (survol), qui piégerait un « position:fixed ».
          Et le portail vise `.svv-adm-root`, pas `body` : c'est là que vivent les couleurs du thème Sombre. */}
      {ouvert && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={syndic?.id ?? null} immeubleDepart={(immeuble ?? '').trim()}
          onFerme={() => setOuvert(false)}
          onEcrire={onEcrire === undefined ? undefined : (email) => { setOuvert(false); onEcrire(email); }} />,
        document.querySelector('.svv-adm-root') ?? document.body,
      )}
    </>
  );
}

/* Rose transparent quand le syndic est connu, blanc sinon. Jetons --color-svv-* uniquement. */
export const CSS_BOUTON_SYNDIC = `
.ann-carte-bouton.bsy{background:var(--color-svv-surface)}
.ann-carte-bouton.bsy--connu,.ann-carte-bouton.bsy--connu:hover{
  background:color-mix(in srgb, var(--color-svv-rose) 14%, transparent);color:var(--color-svv-rose);
  border-color:color-mix(in srgb, var(--color-svv-rose) 45%, transparent)}
.ann-carte-bouton.bsy--connu:hover{background:color-mix(in srgb, var(--color-svv-rose) 22%, transparent)}
`;
