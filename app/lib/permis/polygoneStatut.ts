import { estFuturBati } from './etatBati';

/**
 * RATT-1 (2) — logique PURE du statut décidé par l'internaute pour un polygone EXISTANT (préservé / détruit). Le registre est
 * APPEND-ONLY (migration 164) : le statut COURANT d'un cleabs = la DERNIÈRE décision ; 'revoque' ramène à « aucun statut décidé ».
 * La SOURCE IGN (`batiment.etat_de_l_objet`) est une donnée DISTINCTE, jamais touchée ici, TOUJOURS affichée à côté de ma décision.
 * PUR (aucune I/O), testable.
 */
/** DÉCISION MANUELLE d'Arno (les deux seuls statuts qu'il peut poser à la main). 'mixte' n'en est PAS : c'est un FAIT géométrique déduit. */
export type StatutDecide = 'preserve' | 'detruit';
/** RATT-6 — statut COURANT possible d'un polygone : décision manuelle OU 'mixte' (partiellement détruit, déduit du taux, non modifiable). */
export type StatutCourant = StatutDecide | 'mixte';
export type LigneStatut = 'preserve' | 'detruit' | 'mixte' | 'revoque';
/** RATT-2/RATT-6 — origine d'une ligne : saisie (Arno) | auto_recouvrement ('detruit' d'office, recouvrement total) | auto_mixte ('mixte'
 *  d'office, recouvrement partiel) | auto_revocation (l'auto défait SA propre ligne quand le recouvrement disparaît). */
export type OrigineStatut = 'saisie' | 'auto_recouvrement' | 'auto_mixte' | 'auto_revocation';

/** Une ligne du registre append-only (telle que lue en base), ordre quelconque. `decideLe` = ISO (tri chronologique lexical sûr).
 *  `origine` = null quand la colonne n'existe pas encore (migration 165 non appliquée) → traité comme « non-auto » (jamais révoqué). */
export interface LigneStatutPolygone { cleabs: string; statut: LigneStatut; etatBdtopoAuMoment: string | null; decidePar: string | null; decideLe: string; origine: OrigineStatut | null }

/** L'état COURANT d'un polygone : mon statut décidé (null si aucun/révoqué), l'origine de la ligne courante, l'état BD TOPO au moment, qui/quand, + l'historique complet. */
export interface EtatStatutPolygone {
  statut: StatutCourant | null;         // null = aucun statut (jamais posé, ou révoqué en dernier) ; 'mixte' = fait géométrique (RATT-6)
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
 * RATT-6 — TOLÉRANCE géométrique du « recouvrement total ». Un polygone entièrement sous l'emprise donne un taux ≈ 100 % à l'epsilon
 * flottant près (ST_Union + ST_Intersection, Lambert-93). Cette tolérance (0,05 point de %) n'absorbe QUE ce bruit numérique/topologique
 * (≪ 0,05 %) : dès 0,1 % de surface réellement survivante, le polygone bascule en « mixte ». Elle ne « rattrape » donc jamais un
 * survivant réel — cf. le test « 99,9 % → mixte ». Constante CENTRALISÉE (aucun 100/99,95 dispersé).
 */
export const TOLERANCE_RECOUVREMENT_TOTAL_PCT = 0.05;

/**
 * RATT-6 — statut GÉOMÉTRIQUE déduit du taux de recouvrement (FAIT, jamais une décision). Trois branches :
 *   · taux ≥ 100 − tolérance          → 'detruit' (recouvrement total à l'epsilon près) ;
 *   · seuil ≤ taux < 100 − tolérance  → 'mixte'   (mordu sans être entièrement couvert : une partie tombe, une partie survit) ;
 *   · taux < seuil                     → null      (chevauchement marginal / anti-bruit de tracé : aucun statut auto).
 * PUR. `seuilPct` fourni par l'appelant (lu en config). Le résultat 'mixte' n'est JAMAIS modifiable à la main (cf. poserStatutPolygone).
 */
export function statutDepuisRecouvrement(tauxPct: number, seuilPct: number): 'detruit' | 'mixte' | null {
  if (tauxPct >= 100 - TOLERANCE_RECOUVREMENT_TOTAL_PCT) return 'detruit';
  if (tauxPct >= seuilPct) return 'mixte';
  return null;
}

/**
 * RATT-2/RATT-6 — DÉCISION PURE des écritures AUTOMATIQUES de statut après un changement d'emprise (enregistrement / adoption / retouche
 * / suppression). `recouverts` = polygones AU-DESSUS du seuil, avec leur taux ; `seuilPct` = seuil courant. Trois familles d'action, jamais
 * au détriment d'une décision humaine :
 *   (1) recouvert + AUCUNE ligne (ou révoqué en dernier) → poser le statut GÉOMÉTRIQUE ('detruit'/'auto_recouvrement' si total,
 *       'mixte'/'auto_mixte' si partiel) ;
 *   (2) recouvert + statut AUTO déjà posé mais d'une AUTRE branche (le recouvrement a changé, ex. total → partiel) → RÉALIGNER sur le
 *       statut géométrique courant ;
 *   (3) statut AUTO ('detruit' ou 'mixte') dont le polygone n'est PLUS recouvert (au-dessus du seuil) → 'revoque'/'auto_revocation'.
 * 🔴 Une décision 'saisie' (ou une origine inconnue) n'est JAMAIS écrite par-dessus ni révoquée : la décision d'Arno prime toujours.
 * `statuts` = statut COURANT par cleabs (cf. statutCourantParCleabs). PUR (aucune I/O).
 */
export interface ActionAutoStatut { cleabs: string; statut: 'detruit' | 'mixte' | 'revoque'; origine: 'auto_recouvrement' | 'auto_mixte' | 'auto_revocation' }
export function actionsAutoStatut(recouverts: readonly PolygoneRecouvert[], seuilPct: number, statuts: Map<string, EtatStatutPolygone>): ActionAutoStatut[] {
  const rec = new Set(recouverts.map((r) => r.cleabs));
  const out: ActionAutoStatut[] = [];
  const origineDe = (s: 'detruit' | 'mixte'): 'auto_recouvrement' | 'auto_mixte' => (s === 'detruit' ? 'auto_recouvrement' : 'auto_mixte');
  // (1)+(2) poser / réaligner le statut géométrique des recouverts (tous au-dessus du seuil → cible ∈ {detruit, mixte}).
  for (const r of recouverts) {
    const cible = statutDepuisRecouvrement(r.tauxPct, seuilPct);
    if (cible === null) continue; // garde défensive (un recouvert est au-dessus du seuil)
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
