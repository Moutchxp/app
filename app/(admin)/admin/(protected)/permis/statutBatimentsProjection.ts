/**
 * (C) — DURCISSEMENT d'un statut de ligne mère par la FRAÎCHEUR client (état LIVE remonté quand le bloc « Caractéristiques du permis » est
 * ouvert). PUR (aucune I/O, aucune couleur). On N'ÉCRASE PAS ce que `base` porte déjà (validation de l'emprise/projection, cohérence du
 * nombre, altitude renseignée/validée déjà comptées serveur) : on AJOUTE deux exigences PAR CARTE, invisibles du serveur car purement
 * client (une valeur non enregistrée / une confirmation non faite n'existent pas en base) :
 *   ① altitude de sommet à valider (jamais validée OU validée puis modifiée depuis) ;
 *   ② bâtiment à enregistrer (jamais enregistré — valeurs encore 'extraite' — OU modifié depuis).
 * Aucun manquement → `base` est renvoyé TEL QUEL (repli serveur, comportement d'avant durcissement). Sinon → ROUGE, en CONSERVANT le
 * manquement de `base` s'il était déjà rouge (jamais un « validé » masquant un vrai reste-à-faire). Employé par les TROIS en-têtes de
 * l'onglet (« Caractéristiques du permis », « Les futurs bâtiments et leurs altitudes », « Bâtiments et projection ») — chaque appelant
 * fournit les listes adaptées à ce que SA base couvre déjà (voir ProjectionVue / CaracteristiquesBloc).
 */
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection';

export interface ManquementsFraicheur {
  aEnregistrer: readonly string[];    // ② non satisfait : bâtiments jamais enregistrés (valeurs 'extraite') OU modifiés depuis
  altitudeAValider: readonly string[]; // ① non satisfait : bâtiments dont l'altitude est à valider (jamais validée OU modifiée depuis)
}

/**
 * Fraîcheur LIVE remontée par le bloc « Caractéristiques du permis » au parent (par dossier ; garde d'appartenance chez l'appelant).
 * Porte les listes NOMMÉES par bâtiment. `altitudeModifiee` ⊆ `altitudeAValider` : le sous-ensemble « validée EN BASE mais modifiée depuis »,
 * réservé à « Bâtiments et projection » dont la base compte DÉJÀ les altitudes jamais validées (éviter un double-décompte).
 */
export interface FraicheurBatimentsLive {
  dossierId: number;
  aEnregistrer: readonly string[];
  altitudeAValider: readonly string[]; // ① COMPLET — pour « Caractéristiques du permis » / « Les futurs bâtiments » (leur base ne teste PAS la validation)
  altitudeModifiee: readonly string[]; // sous-ensemble validée-puis-modifiée — pour « Bâtiments et projection » (base = altitude validée serveur)
}

/** Aucun manquement de fraîcheur ? (les deux listes vides) — dans ce cas le statut serveur `base` porte seul le titre. */
export function fraicheurSansManquement(m: ManquementsFraicheur): boolean {
  return m.aEnregistrer.length === 0 && m.altitudeAValider.length === 0;
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
  if (fraicheurSansManquement(m)) return base; // repli : rien à enregistrer / à valider → l'état serveur reste la vérité
  const manque: string[] = [];
  if (m.aEnregistrer.length > 0) {
    manque.push(`${m.aEnregistrer.length} bâtiment${m.aEnregistrer.length > 1 ? 's' : ''} à enregistrer (${listeAbregee(m.aEnregistrer)})`);
  }
  if (m.altitudeAValider.length > 0) {
    manque.push(`${m.altitudeAValider.length} altitude${m.altitudeAValider.length > 1 ? 's' : ''} à valider (${listeAbregee(m.altitudeAValider)})`);
  }
  // On CONSERVE le manquement serveur s'il bloquait déjà (emprise/altitude non validée, cohérence) : le nouveau détail s'AJOUTE, ne remplace pas.
  const tete = base.ton === 'rouge' ? [base.texte] : [];
  return { ton: 'rouge', texte: [...tete, ...manque].join(' · ') };
}
