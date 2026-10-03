/**
 * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « LE STATUT DRIVE DES PIÈCES VIENT DE CHANGER » ══════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Il ne porte qu'un registre d'auditeurs en
 * mémoire du navigateur — donc importable depuis un `'use client'` (règle du module depuis l'incident du
 * 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026, fil 36669 / message 57427, « test gigout.pdf ») : « après un glisser-déposer dans
 * Test / Test creation dossier drive (✓ Rangée dans…), […] de retour dans le mail, la miniature n'a pas le picto
 * cylindre. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE — ET C'EST UNE CAUSE D'ÉCRAN, PAS DE BASE. Le statut Drive des pièces est tenu à
 * DEUX endroits indépendants, et chacun n'était rafraîchi que par SA PROPRE fenêtre :
 *
 *   · `PiecesJointes` (les miniatures d'UN mail) tient `statuts`, relu par son `onRangement` ;
 *   · `Conversation`  (le récapitulatif « Pièces jointes de la conversation ») tient `emplacementsFil`, relu par
 *     le sien.
 *
 * Ranger depuis le récapitulatif laissait donc les cartes du mail avec leur image d'avant — et inversement. Pire :
 * `HistoriqueCible` et `VieDuBien` montent eux aussi des `PiecesJointes`, sans aucune fenêtre de rangement à elles.
 * MESURÉ EN BASE : la ligne du registre existait bien (`gestion_piece_drive` id 26554, piece_id 27085, déposée à
 * 21:37:35) — le serveur savait, l'écran ne le lui avait pas redemandé.
 *
 * ═══ 🔴 POURQUOI UN SIGNAL, ET NON UN RAPPEL DE PLUS DANS LES PROPRIÉTÉS ════════════════════════════════════════
 *
 * Un `onStatutDrive` passé de main en main devrait traverser `Conversation` → le message → `PiecesJointes`, puis
 * être recâblé à l'identique dans `HistoriqueCible` et `VieDuBien` — quatre chemins à tenir d'accord, et un
 * cinquième écran à ne pas oublier le jour où il montrera des pièces. Le signal, lui, n'a qu'une règle : qui
 * AFFICHE un statut de pièce s'y abonne, et qui en CHANGE un l'annonce.
 *
 * ⚠️ IL N'EST PAS UN CACHE, ET SURTOUT PAS UNE DONNÉE. Il ne transporte aucun emplacement : il dit « redemande ».
 * La vérité reste celle du serveur (`/messages/[id]/drive`, `/fils/[id]/pieces-drive`, `/drive/localiser`), et
 * c'est elle qui s'affiche — exactement comme la mise à jour optimiste des compteurs de la colonne (lot
 * COMPTEURS), où le delta ne fait que combler les 150 ms de la relecture.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * CE QUE PORTE LE SIGNAL : les pièces touchées, quand on les connaît.
 *
 * ⚠️ UNE LISTE VIDE VEUT DIRE « ON NE SAIT PAS LESQUELLES », JAMAIS « AUCUNE ». C'est le cas d'un geste fait sur
 * un FICHIER du Drive (mise à la corbeille, déplacement, annulation) : l'écran ne sait pas de quelle pièce ce
 * fichier est la copie — le registre le sait, lui, et c'est à lui qu'on redemandera. Tout le monde relit alors,
 * et c'est la bonne réponse : un geste rare, et une lecture qui ne sort pas de la base.
 */
export interface SignalPiecesDrive {
  pieceIds: readonly number[];
}

export type AuditeurPiecesDrive = (s: SignalPiecesDrive) => void;

/**
 * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte (le dépliage d'un message) ne doit pas
 * laisser derrière lui un auditeur mort, et deux abonnements du même auditeur ne doivent pas faire deux lectures.
 */
const auditeurs = new Set<AuditeurPiecesDrive>();

/**
 * S'ABONNER. Rend la fonction de désabonnement — c'est le contrat d'un `useEffect`, et le seul qui garantisse
 * qu'un écran fermé cesse de lire.
 */
export function ecouterPiecesDrive(f: AuditeurPiecesDrive): () => void {
  auditeurs.add(f);
  return () => { auditeurs.delete(f); };
}

/**
 * ANNONCER qu'un ou plusieurs statuts ont changé.
 *
 * ⚠️ UN AUDITEUR QUI LÈVE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS. Sans cette garde, un écran en cours de
 * démontage ferait rater la relecture de tous ceux qui viennent après lui dans le `Set` — et le défaut serait
 * intermittent, donc introuvable.
 */
export function annoncerPiecesDrive(pieceIds: readonly number[] = []): void {
  const s: SignalPiecesDrive = { pieceIds: [...new Set(pieceIds.filter((n) => Number.isSafeInteger(n) && n > 0))] };
  for (const f of [...auditeurs]) {
    try { f(s); } catch (e) { console.error('[gestion/signal-piece-drive] auditeur en échec', e); }
  }
}

/**
 * CE SIGNAL ME CONCERNE-T-IL ? PUR.
 *
 * ⚠️ UNE LISTE VIDE CONCERNE TOUT LE MONDE (voir l'encadré de `SignalPiecesDrive`) : ne pas savoir quelles pièces
 * ont bougé doit faire relire, jamais faire ignorer. Le contraire laisserait l'écran sur une image fausse
 * précisément dans le cas où l'on en sait le moins.
 */
export function concernePieces(s: SignalPiecesDrive, miennes: readonly number[]): boolean {
  if (s.pieceIds.length === 0) return true;
  return s.pieceIds.some((id) => miennes.includes(id));
}
