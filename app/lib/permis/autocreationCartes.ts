/**
 * BAT-1 — DÉCISION PURE d'auto-création des cartes de bâtiment + pose du NOMBRE VALIDÉ. Aucune I/O. Le nombre DÉTECTÉ n'existe pas en
 * colonne : on le reconstitue = max(nombre de corps déjà matérialisés, décompte corroboré du champ libre — LOT 69). On ACCEPTE ce
 * détecté PAR DÉFAUT (nb_batiments_valide := détecté) et on crée les cartes VIDES manquantes pour l'atteindre.
 *
 * INVARIANTS :
 *  - Une DÉCISION HUMAINE (nb_batiments_valide déjà posé) n'est JAMAIS recalculée : intouché (poser=null, creer=0). Le détecté peut
 *    évoluer, le validé est une décision.
 *  - 0 détecté ⇒ NO-OP : on ne pose PAS 0 (NULL doit rester distinguable de 0 — on n'auto-valide jamais « zéro bâtiment »).
 *  - creer = max(0, détecté − corps existants) : on ne crée que le MANQUE ; jamais on ne retire (la diminution est BAT-3).
 */

export interface EtatAutocreation {
  nbValide: number | null; // nb_batiments_valide actuel (null = pas encore validé)
  nbCorps: number;          // cartes déjà existantes (permis_corps_batiment)
  nbDecompte: number;       // décompte corroboré du champ libre (LOT 69), 0 si aucun
}

export interface DecisionAutocreation {
  poser: number | null; // nombre validé à poser (null = ne rien poser)
  creer: number;        // nombre de cartes VIDES à créer
  detecte: number;      // nombre détecté reconstitué (pour le rapport)
  motif: string;
}

export function decisionAutocreationCartes(e: EtatAutocreation): DecisionAutocreation {
  const detecte = Math.max(e.nbCorps, e.nbDecompte);
  if (e.nbValide !== null) {
    return { poser: null, creer: 0, detecte, motif: `nombre déjà validé (${e.nbValide}) — décision humaine, intouché` };
  }
  if (detecte === 0) {
    return { poser: null, creer: 0, detecte, motif: '0 bâtiment détecté — rien posé (NULL préservé, jamais 0 par défaut)' };
  }
  const creer = Math.max(0, detecte - e.nbCorps);
  return { poser: detecte, creer, detecte, motif: `${detecte} détecté(s) (corps ${e.nbCorps}, décompte ${e.nbDecompte}) → poser ${detecte}, créer ${creer} carte(s) vide(s)` };
}
