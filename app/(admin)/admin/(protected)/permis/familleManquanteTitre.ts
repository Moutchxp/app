// ② — NOMMER les familles manquantes dans le titre de complétude (« dossier incomplet (N familles manquantes : … ) »).
//   Module PUR (et testé). Il vit ICI (côté UI) et NON dans app/lib/permis/* (lecture seule) : il ne fait qu'ENVELOPPER la formulation
//   UNIQUE `libelleFamillesManquantes` (le compte + « dossier incomplet »), à laquelle il ajoute la liste des noms — aucun second
//   vocabulaire. Les NOMS de familles doivent venir de la SOURCE UNIQUE `LIBELLE_FAMILLE` (diagnosticCompletude), fournis par l'appelant.
import { libelleFamillesManquantes } from '../../../../lib/permis/completudeResume';

/**
 * ② — au-delà de ce nombre de familles NOMMÉES, on abrège (« premiers … et N autre(s) ») pour que le titre reste lisible sur UNE ligne en
 * iPhone portrait (les libellés « Plan de masse », « Plan de coupe »… sont longs). Il n'y a au plus que 4 familles suivies, donc l'abrègement
 * ne joue qu'à 3-4 manquantes ; le DÉTAIL complet reste toujours visible en dépliant le bloc « Complétude des pièces ».
 */
export const LIMITE_FAMILLES_NOMMEES = 2;

/**
 * ② — « dossier incomplet (N famille(s) manquante(s)) » ENRICHI des NOMS. Le NOMBRE est toujours présent (formulation `libelleFamillesManquantes`,
 * source unique), même à une seule famille. Les noms sont insérés avant la parenthèse fermante : « … manquante : Plan de coupe) ».
 *   · `noms` vide → identique au compte seul (rétro-compatible : appelant sans les noms) ;
 *   · `noms.length ≤ LIMITE` → tous listés (dans l'ordre reçu, canonique ORDRE_FAMILLES) ;
 *   · au-delà → les premiers puis « et N autre(s) ».
 * PUR (aucune I/O, aucune couleur).
 */
export function libelleFamillesManquantesNommees(manquantes: number, noms: readonly string[]): string {
  const base = libelleFamillesManquantes(manquantes); // « dossier incomplet (N famille(s) manquante(s)) »
  if (noms.length === 0) return base;
  let liste: string;
  if (noms.length <= LIMITE_FAMILLES_NOMMEES) {
    liste = noms.join(', ');
  } else {
    const reste = noms.length - LIMITE_FAMILLES_NOMMEES;
    liste = `${noms.slice(0, LIMITE_FAMILLES_NOMMEES).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`;
  }
  return `${base.slice(0, -1)} : ${liste})`; // insère « : liste » AVANT la parenthèse fermante de `base`
}
