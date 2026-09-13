/**
 * (C) — STATUT de la ligne mère « Bâtiments et projection », DURCI par la fraîcheur client (état LIVE remonté quand le bloc
 * « Caractéristiques du permis » est ouvert). PUR (aucune I/O, aucune couleur). On N'ÉCRASE PAS ce que `base` porte déjà (validation de
 * l'emprise/projection + altitude validée, calculées serveur) : on AJOUTE deux exigences PAR CARTE, invisibles du serveur car purement
 * client (une modif non enregistrée n'existe pas en base) :
 *   ① altitude de sommet validée ET À JOUR (validée en base, valeur du champ inchangée depuis) ;
 *   ② bâtiment enregistré ET À JOUR (aucun champ enregistré modifié depuis).
 * Aucun manquement de fraîcheur → `base` est renvoyé TEL QUEL (repli serveur, comportement d'avant ce lot). Sinon → ROUGE, en CONSERVANT
 * le manquement de `base` s'il était déjà rouge (jamais un « validé » masquant un vrai reste-à-faire).
 */
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection';

export interface ManquementsFraicheur {
  aEnregistrer: readonly string[];       // noms des bâtiments avec une modification non enregistrée (② non à jour)
  altitudeARevalider: readonly string[]; // noms des bâtiments dont l'altitude, validée en base, a été modifiée depuis (① plus à jour)
}

/** Fraîcheur LIVE remontée par le bloc « Caractéristiques du permis » au parent (par dossier ; garde d'appartenance chez l'appelant). */
export interface FraicheurBatimentsLive extends ManquementsFraicheur { dossierId: number }

/** Aucun manquement de fraîcheur ? (les deux listes vides) — dans ce cas le statut serveur `base` porte seul le titre. */
export function fraicheurSansManquement(m: ManquementsFraicheur): boolean {
  return m.aEnregistrer.length === 0 && m.altitudeARevalider.length === 0;
}

// Abrègement lisible sur une ligne (inspiré de familleManquanteTitre : 2 premiers nommés, puis « et N autre(s) »). Le détail complet
//   reste visible en dépliant « Caractéristiques du permis ». LIMITE volontairement identique (2) pour une lecture homogène.
const LIMITE_NOMS = 2;
function listeAbregee(noms: readonly string[]): string {
  if (noms.length <= LIMITE_NOMS) return noms.join(', ');
  const reste = noms.length - LIMITE_NOMS;
  return `${noms.slice(0, LIMITE_NOMS).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`;
}

export function statutBatimentsProjection(base: EtatTitreFamille, m: ManquementsFraicheur): EtatTitreFamille {
  if (fraicheurSansManquement(m)) return base; // repli : rien de non enregistré / de modifié en attente → l'état serveur reste la vérité
  const manque: string[] = [];
  if (m.aEnregistrer.length > 0) {
    manque.push(`${m.aEnregistrer.length} bâtiment${m.aEnregistrer.length > 1 ? 's' : ''} à enregistrer (${listeAbregee(m.aEnregistrer)})`);
  }
  if (m.altitudeARevalider.length > 0) {
    manque.push(`${m.altitudeARevalider.length} altitude${m.altitudeARevalider.length > 1 ? 's' : ''} à revalider (${listeAbregee(m.altitudeARevalider)})`);
  }
  // On CONSERVE le manquement serveur s'il bloquait déjà (emprise/altitude non validée) : le nouveau détail s'AJOUTE, ne remplace pas.
  const tete = base.ton === 'rouge' ? [base.texte] : [];
  return { ton: 'rouge', texte: [...tete, ...manque].join(' · ') };
}
