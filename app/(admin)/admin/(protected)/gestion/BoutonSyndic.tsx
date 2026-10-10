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
 * largeur, texte centré. Syndic connu : fond ROSE. Inconnu : fond BLANC, “Créer le syndic” → modale de création. »
 *
 * ══ 🔴 LOT FICHE-SYNDIC-FINITIONS ════════════════════════════════════════════════════════════════════════════════
 *   · LE NOM DU SYNDIC remplace « Coordonnées syndic » ; un nom trop long se tronque (« … ») et s'affiche en entier
 *     au survol (`title`) et pour les lecteurs d'écran (`aria-label`).
 *   · EXACTEMENT LE FORMAT DE « HISTORIQUE » : même classe de bouton, ET le même retrait de 14 px à gauche et à
 *     droite. C'était l'écart constaté : « Historique » vit dans `.ann-carte-pied` (padding 0 14px), alors que ce
 *     bouton était un enfant direct de la carte, donc bord à bord. Il vit maintenant dans `.bsy-ligne`, qui porte le
 *     même retrait. Dans la fiche du bien (`dansLaFiche`), il n'y a pas de carte autour : aucun retrait.
 *   · ROSE FRANC, PAS ROUGE : jetons `--color-svv-syndic-*` (globals.css), contraste 6,71:1 en Clair, 7,63:1 en
 *     Sombre. « Créer le syndic » reste blanc.
 *
 * 🔴 « CONNU » SE LIT PAR L'IMMEUBLE DU LOT (la colonne « Immeuble » de WIPPIMMO, normalisée) : c'est la seule
 * clé de copropriété qui existe. Un lot sans immeuble n'a donc jamais de syndic « connu ».
 *
 * ⚠️ RIEN N'APPARAÎT tant que les migrations ne sont pas appliquées, ni avant la première lecture : un bouton qui
 * dirait « Créer » pendant une fraction de seconde puis le nom du syndic se lirait comme une erreur.
 */

/** Le composeur « écrire depuis gestion@ », fourni par l'écran qui le possède (l'Annuaire). */
export const EcrireDepuisGestion = createContext<((email: string) => void) | undefined>(undefined);

export function BoutonSyndic({ immeuble, dansLaFiche = false }: {
  immeuble: string | null | undefined;
  /** Vrai dans la fiche du bien : pas de carte autour, donc pas de retrait. */
  dansLaFiche?: boolean;
}) {
  const etat = useImmeublesSyndics();
  const onEcrire = useContext(EcrireDepuisGestion);
  const [ouvert, setOuvert] = useState(false);
  if (etat === null || !etat.disponible) return null;
  const cle = cleImmeuble(immeuble);
  const connu = cle === '' ? undefined : etat.immeubles.find((i) => i.cle === cle);
  const syndic = connu?.syndic ?? null;
  const libelle = (immeuble ?? '').trim();
  return (
    <span className={`bsy-ligne${dansLaFiche ? ' bsy-ligne--fiche' : ''}`}>
      <style>{CSS_BOUTON_SYNDIC}</style>
      <button type="button"
        className={`svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large bsy${syndic !== null ? ' bsy--connu' : ''}`}
        title={syndic !== null ? `Syndic : ${syndic.nom}` : 'Aucun syndic connu pour cet immeuble'}
        aria-label={syndic !== null ? `Syndic : ${syndic.nom} — ouvrir sa fiche` : 'Créer le syndic'}
        onClick={() => setOuvert(true)}>
        <span className="bsy-mot">{syndic !== null ? syndic.nom : 'Créer le syndic'}</span>
      </button>
      {/* ⚠️ DANS UN PORTAIL : la carte peut porter une transformation (survol), qui piégerait un « position:fixed ».
          Et le portail vise `.svv-adm-root`, pas `body` : c'est là que vivent les couleurs du thème Sombre. */}
      {ouvert && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={syndic?.id ?? null}
          immeubleDepart={{ libelle, codePostal: connu?.codePostal ?? '', commune: connu?.commune ?? '' }}
          onFerme={() => setOuvert(false)}
          onEcrire={onEcrire === undefined ? undefined : (email) => { setOuvert(false); onEcrire(email); }} />,
        document.querySelector('.svv-adm-root') ?? document.body,
      )}
    </span>
  );
}

/* Rose franc (jetons --color-svv-syndic-*) quand le syndic est connu, blanc sinon. AUCUN ACCENT GRAVE ici.
   .bsy-ligne porte LE MEME retrait que .ann-carte-pied (0 14px) : c'est ce qui aligne les deux boutons. */
export const CSS_BOUTON_SYNDIC = `
.bsy-ligne{display:flex;flex-direction:column;align-items:stretch;padding:0 14px;margin:0 0 .4rem;box-sizing:border-box}
.bsy-ligne--fiche{padding:0;margin:0 0 .6rem}
.ann-carte-bouton.bsy{background:var(--color-svv-surface);min-width:0}
.bsy-mot{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}
.ann-carte-bouton.bsy--connu,.ann-carte-bouton.bsy--connu:hover,.svv-adm-root .ann-carte-bouton.bsy--connu:hover{
  background:var(--color-svv-syndic-fond);color:var(--color-svv-syndic-texte);border-color:var(--color-svv-syndic-bord)}
.ann-carte-bouton.bsy--connu:hover{filter:brightness(.97)}
`;
