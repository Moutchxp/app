import { estFuturBati } from './etatBati';

/**
 * RATT-1 (2) — logique PURE du statut décidé par l'internaute pour un polygone EXISTANT (préservé / détruit). Le registre est
 * APPEND-ONLY (migration 164) : le statut COURANT d'un cleabs = la DERNIÈRE décision ; 'revoque' ramène à « aucun statut décidé ».
 * La SOURCE IGN (`batiment.etat_de_l_objet`) est une donnée DISTINCTE, jamais touchée ici, TOUJOURS affichée à côté de ma décision.
 * PUR (aucune I/O), testable.
 */
export type StatutDecide = 'preserve' | 'detruit';
export type LigneStatut = 'preserve' | 'detruit' | 'revoque';

/** Une ligne du registre append-only (telle que lue en base), ordre quelconque. `decideLe` = ISO (tri chronologique lexical sûr). */
export interface LigneStatutPolygone { cleabs: string; statut: LigneStatut; etatBdtopoAuMoment: string | null; decidePar: string | null; decideLe: string }

/** L'état COURANT d'un polygone : mon statut décidé (null si aucun/révoqué), l'état BD TOPO au moment, qui/quand, + l'historique complet. */
export interface EtatStatutPolygone {
  statut: StatutDecide | null;          // null = aucun statut décidé (jamais posé, ou révoqué en dernier)
  etatBdtopoAuMoment: string | null;    // snapshot de la source au moment de la décision courante
  decidePar: string | null;
  decideLe: string | null;
  historique: LigneStatutPolygone[];    // toutes les décisions, de la plus RÉCENTE à la plus ancienne (audit : qui a décidé quoi et quand)
}

/**
 * Statut COURANT par cleabs à partir des lignes append-only. Dernière ligne (decideLe DESC) = le courant ; 'revoque' → statut null
 * (mais l'historique reste). Aucune ligne pour un cleabs → absent de la Map (aucun statut décidé). PUR.
 */
export function statutCourantParCleabs(lignes: readonly LigneStatutPolygone[]): Map<string, EtatStatutPolygone> {
  const parCleabs = new Map<string, LigneStatutPolygone[]>();
  for (const l of lignes) (parCleabs.get(l.cleabs) ?? parCleabs.set(l.cleabs, []).get(l.cleabs)!).push(l);
  const out = new Map<string, EtatStatutPolygone>();
  for (const [cleabs, lg] of parCleabs) {
    const hist = [...lg].sort((a, b) => (a.decideLe < b.decideLe ? 1 : a.decideLe > b.decideLe ? -1 : 0)); // récent → ancien
    const courant = hist[0];
    const statut = courant.statut === 'revoque' ? null : courant.statut;
    out.set(cleabs, {
      statut,
      etatBdtopoAuMoment: courant.etatBdtopoAuMoment,
      decidePar: courant.decidePar,
      decideLe: courant.decideLe,
      historique: hist,
    });
  }
  return out;
}

/** Un polygone est-il STATUABLE (candidat à préservé/détruit) ? Ni « futur bâti » (En projet / En construction — ceux-là relèvent de
 *  l'adoption/écart), ni recouvert par une emprise PROJETÉE (le futur bâtiment le remplace). Il faut un cleabs. PUR. */
export function estStatuable(polygone: { cleabs: string | null; etat: string | null }, recouverts: readonly string[]): boolean {
  return polygone.cleabs !== null && !estFuturBati(polygone.etat) && !recouverts.includes(polygone.cleabs);
}
