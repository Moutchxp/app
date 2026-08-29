import { estFuturBati } from './etatBati';

/**
 * RATT-1 (2) — logique PURE du statut décidé par l'internaute pour un polygone EXISTANT (préservé / détruit). Le registre est
 * APPEND-ONLY (migration 164) : le statut COURANT d'un cleabs = la DERNIÈRE décision ; 'revoque' ramène à « aucun statut décidé ».
 * La SOURCE IGN (`batiment.etat_de_l_objet`) est une donnée DISTINCTE, jamais touchée ici, TOUJOURS affichée à côté de ma décision.
 * PUR (aucune I/O), testable.
 */
export type StatutDecide = 'preserve' | 'detruit';
export type LigneStatut = 'preserve' | 'detruit' | 'revoque';
/** RATT-2 — origine d'une ligne : saisie (Arno) | auto_recouvrement ('detruit' d'office car recouvert) | auto_revocation (l'auto défait SA ligne). */
export type OrigineStatut = 'saisie' | 'auto_recouvrement' | 'auto_revocation';

/** Une ligne du registre append-only (telle que lue en base), ordre quelconque. `decideLe` = ISO (tri chronologique lexical sûr).
 *  `origine` = null quand la colonne n'existe pas encore (migration 165 non appliquée) → traité comme « non-auto » (jamais révoqué). */
export interface LigneStatutPolygone { cleabs: string; statut: LigneStatut; etatBdtopoAuMoment: string | null; decidePar: string | null; decideLe: string; origine: OrigineStatut | null }

/** L'état COURANT d'un polygone : mon statut décidé (null si aucun/révoqué), l'origine de la ligne courante, l'état BD TOPO au moment, qui/quand, + l'historique complet. */
export interface EtatStatutPolygone {
  statut: StatutDecide | null;          // null = aucun statut décidé (jamais posé, ou révoqué en dernier)
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

/**
 * RATT-2 — DÉCISION PURE des écritures AUTOMATIQUES de statut à appliquer après un changement d'emprise (enregistrement / adoption /
 * retouche / suppression). Deux règles, jamais au détriment d'une décision humaine :
 *   (1) un polygone RECOUVERT et JAMAIS statué (aucune ligne) → poser 'detruit' d'origine 'auto_recouvrement' ;
 *   (2) un polygone dont le statut COURANT est un 'detruit' d'origine 'auto_recouvrement' MAIS qui n'est PLUS recouvert → poser
 *       'revoque' d'origine 'auto_revocation'.
 * 🔴 On n'écrit JAMAIS par-dessus un polygone déjà statué (règle 1), et on ne révoque JAMAIS une décision 'saisie' (règle 2) : la
 * décision d'Arno prime toujours. `statuts` = statut COURANT par cleabs (cf. statutCourantParCleabs). PUR (aucune I/O).
 */
export interface ActionAutoStatut { cleabs: string; statut: 'detruit' | 'revoque'; origine: 'auto_recouvrement' | 'auto_revocation' }
export function actionsAutoStatut(recouverts: readonly string[], statuts: Map<string, EtatStatutPolygone>): ActionAutoStatut[] {
  const rec = new Set(recouverts);
  const out: ActionAutoStatut[] = [];
  // (1) recouvert + AUCUNE ligne → 'detruit' d'office.
  for (const cleabs of rec) if (!statuts.has(cleabs)) out.push({ cleabs, statut: 'detruit', origine: 'auto_recouvrement' });
  // (2) 'detruit' auto qui n'est plus recouvert → révocation auto. Une 'saisie' (ou une origine inconnue, colonne 165 absente) N'est PAS révoquée.
  for (const [cleabs, e] of statuts) if (e.statut === 'detruit' && e.origine === 'auto_recouvrement' && !rec.has(cleabs)) out.push({ cleabs, statut: 'revoque', origine: 'auto_revocation' });
  return out;
}
