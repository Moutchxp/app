// RECALCUL AUTOMATIQUE DES STATUTS après un ajustement — MODULE PUR, source unique du calcul, partagé par les DEUX affichages (notification
//   de la zone d'alerte + marquage du bloc « Affectation … des bâtiments existants »).
//
// Contexte (décision Arno) : la « règle e » est levée — déplacer/tourner/redimensionner une emprise RECALCULE désormais les statuts des
//   bâtiments existants recouverts (appliquerAutoStatut). Sa raison d'être — ne JAMAIS écraser une décision humaine — est intégralement
//   préservée : appliquerAutoStatut ne touche que les statuts « proposés automatiquement », jamais un statut « décidé à la main ». Ce module
//   calcule, entre l'état AVANT et l'état APRÈS le recalcul :
//     · les CHANGEMENTS (le statut auto d'un bâtiment a changé, ou un bâtiment est ENTRÉ / SORTI de sous l'emprise) — pour la notification ;
//     · les DÉSACCORDS (le recalcul proposerait X alors qu'une décision manuelle dit Y — la décision manuelle RESTE en place) — pour le bloc.
//   Aucune I/O, aucune couleur, aucun libellé d'écran ici (l'appelant traduit). Vocabulaire unique = les statuts 'preserve'|'mixte'|'detruit'.
import type { EtatStatutPolygone, OrigineStatut, PolygoneRecouvert, StatutDecide } from '../../../../lib/permis/polygoneStatut';
import { statutDepuisRecouvrement } from '../../../../lib/permis/polygoneStatut';

/** État minimal d'un bâtiment existant pour le diff, à un instant (avant OU après le recalcul). PUR. */
export interface EtatPourDiff {
  cleabs: string;
  statut: StatutDecide | null;   // statut COURANT appliqué (null = aucun)
  origine: OrigineStatut | null; // 'saisie' = décidé à la main ; 'auto_*' = proposé automatiquement
  recouvert: boolean;            // le bâtiment est-il sous l'emprise projetée ?
  autoPropose: StatutDecide;     // ce que le recalcul PROPOSE (recouvert → 'detruit'/'mixte' ; sinon 'preserve')
}

export type NatureChangement = 'entree' | 'sortie' | 'statut';
/** Un bâtiment dont le statut a changé du fait du recalcul (auto uniquement — un statut manuel ne change jamais ici). */
export interface ChangementStatut { cleabs: string; nature: NatureChangement; avant: StatutDecide | null; apres: StatutDecide | null }
/** Un bâtiment où le recalcul proposerait autre chose que la décision manuelle en place. */
export interface DesaccordStatut { cleabs: string; manuel: StatutDecide; autoPropose: StatutDecide }
export interface DiffRecalcul { changements: ChangementStatut[]; desaccords: DesaccordStatut[]; aDesChangements: boolean }

/**
 * Construit l'instantané `EtatPourDiff[]` d'un dossier à partir du statut COURANT par cleabs et des bâtiments recouverts (avec leur taux).
 * `autoPropose` = statut géométrique proposé (`statutDepuisRecouvrement`) pour un recouvert, sinon 'preserve'. PUR (réutilise la règle des seuils).
 */
export function construireEtatsPourDiff(
  statuts: ReadonlyMap<string, EtatStatutPolygone>,
  recouverts: readonly PolygoneRecouvert[],
  plancherPct: number,
  seuilDetruitPct: number,
): EtatPourDiff[] {
  const tauxParCleabs = new Map(recouverts.map((r) => [r.cleabs, r.tauxPct]));
  const cleabsUnion = new Set<string>([...statuts.keys(), ...tauxParCleabs.keys()]);
  const out: EtatPourDiff[] = [];
  for (const cleabs of cleabsUnion) {
    const e = statuts.get(cleabs);
    const recouvert = tauxParCleabs.has(cleabs);
    const autoPropose: StatutDecide = recouvert ? (statutDepuisRecouvrement(tauxParCleabs.get(cleabs)!, plancherPct, seuilDetruitPct) ?? 'preserve') : 'preserve';
    out.push({ cleabs, statut: e?.statut ?? null, origine: e?.origine ?? null, recouvert, autoPropose });
  }
  return out;
}

/**
 * Diff entre l'AVANT et l'APRÈS du recalcul. PUR.
 *  · CHANGEMENT : le statut APPLIQUÉ a changé (avant ≠ après). Nature : 'entree' (n'était pas recouvert → l'est), 'sortie' (l'était → ne
 *    l'est plus), sinon 'statut'. Comme le recalcul ne modifie que l'auto, les décisions manuelles n'y apparaissent jamais.
 *  · DÉSACCORD : un statut « décidé à la main » (origine 'saisie') que le recalcul contredirait (autoPropose ≠ statut manuel).
 */
export function diffStatutsRecalcul(avant: readonly EtatPourDiff[], apres: readonly EtatPourDiff[]): DiffRecalcul {
  const avantMap = new Map(avant.map((e) => [e.cleabs, e]));
  const apresMap = new Map(apres.map((e) => [e.cleabs, e]));
  const cleabsUnion = new Set<string>([...avantMap.keys(), ...apresMap.keys()]);
  const changements: ChangementStatut[] = [];
  const desaccords: DesaccordStatut[] = [];
  for (const cleabs of cleabsUnion) {
    const b = avantMap.get(cleabs);
    const a = apresMap.get(cleabs);
    const statutAvant = b?.statut ?? null;
    const statutApres = a?.statut ?? null;
    if (statutAvant !== statutApres) {
      const recouvertAvant = b?.recouvert ?? false;
      const recouvertApres = a?.recouvert ?? false;
      const nature: NatureChangement = (!recouvertAvant && recouvertApres) ? 'entree' : (recouvertAvant && !recouvertApres) ? 'sortie' : 'statut';
      changements.push({ cleabs, nature, avant: statutAvant, apres: statutApres });
    }
    if (a && a.origine === 'saisie' && a.statut !== null && a.autoPropose !== a.statut) {
      desaccords.push({ cleabs, manuel: a.statut, autoPropose: a.autoPropose });
    }
  }
  return { changements, desaccords, aDesChangements: changements.length > 0 || desaccords.length > 0 };
}

/**
 * DÉSACCORDS encore ACTIFS au regard des statuts COURANTS : un désaccord calculé au moment du recalcul disparaît dès qu'Arno l'a résolu
 * (statut passé à ce que proposait le recalcul, ou repassé à l'automatique). Sert au marquage LIVE du bloc (on ne marque plus un désaccord
 * réglé). PUR. Un désaccord reste actif tant que le statut courant du cleabs est TOUJOURS la décision manuelle initiale ET diffère du recalcul.
 */
export function desaccordsActifs(desaccords: readonly DesaccordStatut[], statutsCourants: ReadonlyMap<string, EtatStatutPolygone>): DesaccordStatut[] {
  return desaccords.filter((d) => {
    const e = statutsCourants.get(d.cleabs);
    return e != null && e.origine === 'saisie' && e.statut === d.manuel && d.manuel !== d.autoPropose;
  });
}
