import { estFuturBati } from './etatBati';

/**
 * RATT-1 (2) — logique PURE du statut décidé par l'internaute pour un polygone EXISTANT (préservé / détruit). Le registre est
 * APPEND-ONLY (migration 164) : le statut COURANT d'un cleabs = la DERNIÈRE décision ; 'revoque' ramène à « aucun statut décidé ».
 * La SOURCE IGN (`batiment.etat_de_l_objet`) est une donnée DISTINCTE, jamais touchée ici, TOUJOURS affichée à côté de ma décision.
 * PUR (aucune I/O), testable.
 */
/** AFF-2 — DÉCISION MANUELLE d'Arno : les TROIS statuts d'affectation qu'il peut poser à la main (arbitrage toujours possible). 'mixte'
 *  (partiellement détruit) est aussi PROPOSÉ automatiquement selon le seuil, mais reste arbitrable — une décision manuelle prime (RATT-2). */
export type StatutDecide = 'preserve' | 'detruit' | 'mixte';
/** Statut COURANT possible d'un polygone : l'un des trois (posé à la main OU proposé par l'auto). Identique à StatutDecide. */
export type StatutCourant = StatutDecide;
export type LigneStatut = 'preserve' | 'detruit' | 'mixte' | 'revoque';
/** RATT-2/RATT-6 — origine d'une ligne : saisie (Arno) | auto_recouvrement ('detruit' d'office, recouvrement total) | auto_mixte ('mixte'
 *  d'office, recouvrement partiel) | auto_revocation (l'auto défait SA propre ligne quand le recouvrement disparaît). */
export type OrigineStatut = 'saisie' | 'auto_recouvrement' | 'auto_mixte' | 'auto_revocation';

/** Une ligne du registre append-only (telle que lue en base), ordre quelconque. `decideLe` = ISO (tri chronologique lexical sûr).
 *  `origine` = null quand la colonne n'existe pas encore (migration 165 non appliquée) → traité comme « non-auto » (jamais révoqué). */
export interface LigneStatutPolygone { cleabs: string; statut: LigneStatut; etatBdtopoAuMoment: string | null; decidePar: string | null; decideLe: string; origine: OrigineStatut | null }

/** L'état COURANT d'un polygone : mon statut décidé (null si aucun/révoqué), l'origine de la ligne courante, l'état BD TOPO au moment, qui/quand, + l'historique complet. */
export interface EtatStatutPolygone {
  statut: StatutCourant | null;         // null = aucun statut (jamais posé, ou revenu à l'auto sans recouvrement) ; sinon l'un des trois (AFF-2)
  origine: OrigineStatut | null;        // RATT-2 — origine de la ligne COURANTE (pour savoir si l'auto peut la révoquer)
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
      origine: courant.origine,
      etatBdtopoAuMoment: courant.etatBdtopoAuMoment,
      decidePar: courant.decidePar,
      decideLe: courant.decideLe,
      historique: hist,
    });
  }
  return out;
}

/** RATT-2 / RATT-4 — un polygone est-il STATUABLE (candidat à préservé/détruit) ? TOUS les bâtiments EXISTANTS de la parcelle le sont, y
 *  compris ceux RECOUVERTS par l'emprise projetée (statués « détruit » d'office, mais basculables — cas d'une surélévation). RATT-4 : un
 *  « futur bâti » (En projet / En construction) devient statuable SI ET SEULEMENT S'IL est RECOUVERT par l'emprise projetée (il sera
 *  effacé/remplacé) ; un futur bâti NON recouvert reste HORS liste. Il faut un cleabs. PUR (le `recouvert` est fourni par l'appelant). */
export function estStatuable(polygone: { cleabs: string | null; etat: string | null }, recouvert = false): boolean {
  return polygone.cleabs !== null && (!estFuturBati(polygone.etat) || recouvert);
}

/** RATT-5 — un cleabs « recouvert » par l'emprise projetée + son TAUX de recouvrement (part de la surface du polygone sous l'emprise, en %). */
export interface PolygoneRecouvert { cleabs: string; tauxPct: number }

/**
 * RATT-5 — un polygone est-il « recouvert » (→ statut « détruit » d'office + mention rouge) au vu de son TAUX de recouvrement ? OUI
 * SSI le taux atteint le SEUIL, **borne incluse** (`tauxPct >= seuilPct`). Un chevauchement marginal (sous le seuil) ne vaut PAS
 * « détruit ». Le `seuilPct` est fourni par l'appelant (lu en config, jamais codé en dur ici). PUR.
 */
export function estRecouvertParEmprise(tauxPct: number, seuilPct: number): boolean {
  return tauxPct >= seuilPct;
}

/**
 * AFF-2 — statut GÉOMÉTRIQUE PROPOSÉ à partir du taux de recouvrement, avec DEUX seuils (règle d'Arno). Trois branches :
 *   · taux ≥ seuilDetruitPct           → 'detruit' (recouvert au seuil « détruit » ou plus : le polygone d'origine disparaît de la projection) ;
 *   · plancherPct ≤ taux < seuilDetruit → 'mixte'   (partiellement détruit : mordu sans atteindre le seuil « détruit », une partie survit) ;
 *   · taux < plancherPct                → null      (aucun recouvrement réel / anti-bruit de tracé → préservé, aucun statut auto).
 * PUR. `plancherPct` = plancher anti-bruit (lireSeuilRecouvrementEmprisePct) ; `seuilDetruitPct` = seuil « détruit » (lireSeuilDestructionPct),
 * tous deux lus en config. AFF-2 : le résultat est une PROPOSITION — Arno peut toujours l'arbitrer à la main (une saisie prime, cf. actionsAutoStatut).
 */
export function statutDepuisRecouvrement(tauxPct: number, plancherPct: number, seuilDetruitPct: number): 'detruit' | 'mixte' | null {
  if (tauxPct < plancherPct) return null;
  return tauxPct >= seuilDetruitPct ? 'detruit' : 'mixte';
}

/**
 * RATT-2/AFF-2 — DÉCISION PURE des écritures AUTOMATIQUES de statut après un changement d'emprise (enregistrement / adoption / retouche
 * / suppression). `recouverts` = polygones AU-DESSUS du plancher, avec leur taux ; `plancherPct` = plancher anti-bruit, `seuilDetruitPct` =
 * seuil « détruit » (au-dessus → detruit ; entre les deux → mixte). Trois familles d'action, jamais au détriment d'une décision humaine :
 *   (1) recouvert + AUCUNE ligne (ou révoqué en dernier) → poser le statut GÉOMÉTRIQUE ('detruit'/'auto_recouvrement' si total,
 *       'mixte'/'auto_mixte' si partiel) ;
 *   (2) recouvert + statut AUTO déjà posé mais d'une AUTRE branche (le recouvrement a changé, ex. total → partiel) → RÉALIGNER sur le
 *       statut géométrique courant ;
 *   (3) statut AUTO ('detruit' ou 'mixte') dont le polygone n'est PLUS recouvert (au-dessus du seuil) → 'revoque'/'auto_revocation'.
 * 🔴 Une décision 'saisie' (ou une origine inconnue) n'est JAMAIS écrite par-dessus ni révoquée : la décision d'Arno prime toujours.
 * `statuts` = statut COURANT par cleabs (cf. statutCourantParCleabs). PUR (aucune I/O).
 */
export interface ActionAutoStatut { cleabs: string; statut: 'detruit' | 'mixte' | 'revoque'; origine: 'auto_recouvrement' | 'auto_mixte' | 'auto_revocation' }
export function actionsAutoStatut(recouverts: readonly PolygoneRecouvert[], plancherPct: number, seuilDetruitPct: number, statuts: Map<string, EtatStatutPolygone>): ActionAutoStatut[] {
  const rec = new Set(recouverts.map((r) => r.cleabs));
  const out: ActionAutoStatut[] = [];
  const origineDe = (s: 'detruit' | 'mixte'): 'auto_recouvrement' | 'auto_mixte' => (s === 'detruit' ? 'auto_recouvrement' : 'auto_mixte');
  // (1)+(2) poser / réaligner le statut géométrique PROPOSÉ des recouverts (au-dessus du plancher → cible ∈ {detruit, mixte} selon le seuil « détruit »).
  for (const r of recouverts) {
    const cible = statutDepuisRecouvrement(r.tauxPct, plancherPct, seuilDetruitPct);
    if (cible === null) continue; // garde défensive (un recouvert est au-dessus du plancher)
    const e = statuts.get(r.cleabs);
    if (!e || e.statut === null) { out.push({ cleabs: r.cleabs, statut: cible, origine: origineDe(cible) }); continue; } // aucune ligne / révoqué → poser
    if (e.origine === 'saisie' || e.origine === null) continue; // décision humaine (ou origine inconnue) → JAMAIS touchée
    if (e.statut !== cible) out.push({ cleabs: r.cleabs, statut: cible, origine: origineDe(cible) }); // auto ayant changé de branche → réaligner
  }
  // (3) statut AUTO ('detruit'/'mixte') dont le polygone n'est plus recouvert → révocation auto. 'saisie'/inconnue : intouchée.
  for (const [cleabs, e] of statuts) {
    if (rec.has(cleabs)) continue;
    if ((e.statut === 'detruit' || e.statut === 'mixte') && (e.origine === 'auto_recouvrement' || e.origine === 'auto_mixte')) {
      out.push({ cleabs, statut: 'revoque', origine: 'auto_revocation' });
    }
  }
  return out;
}
