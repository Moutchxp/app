/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — « LES CARTES DE CONTACT DE CE BIEN VIENNENT DE CHANGER » ════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Il ne porte qu'un registre d'auditeurs en
 * mémoire du navigateur — donc importable depuis un `'use client'` (règle du module depuis l'incident du
 * 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « SYNCHRONISATION TOTALE avec le bloc Parties : créer une carte par
 * le “+”, glisser une capsule d'un côté à l'autre, vérifier, modifier ou retirer, que ce soit depuis le haut ou
 * depuis le bas, met à jour l'autre endroit en direct. Une seule porte d'écriture. »
 *
 * ═══ 🔴 POURQUOI UN SIGNAL, ET NON UN RAPPEL DE PLUS PASSÉ DE MAIN EN MAIN ═══════════════════════════════════════
 *
 * Les cartes de contact d'un bien s'affichent désormais à DEUX endroits, et chacun tient sa propre liste :
 *   · le HAUT de la fiche — deux carrousels, montés par `VueLot` ;
 *   · le BAS de la fiche — le bloc « Historique du bien », qui lit les mêmes cartes pour sa pastille et ses
 *     capsules, et les relit lui-même par `/api/admin/gestion/historique/parties`.
 *
 * Un `onCartesChangees` passé de main en main devrait traverser `Annuaire` → `VueLot` → `BlocCartes` →
 * `CarteContact`, ET redescendre dans `HistoriqueDuBien` → `GroupeDeParties` → `CapsulePartie`. Six chemins à
 * tenir d'accord, et un septième à ne pas oublier le jour où un troisième écran montrera ces cartes. Le signal,
 * lui, n'a qu'une règle : **qui AFFICHE des cartes de contact s'y abonne, et qui en CHANGE une l'annonce.**
 *
 * C'est exactement le patron de `signalPieceDrive`, écrit au lot PASTILLE-DRIVE-EN-DIRECT pour le même genre de
 * défaut (« de retour dans le mail, la miniature n'a pas le picto cylindre »). Deux signaux séparés plutôt qu'un
 * seul générique : ils ne portent pas la même clé, et un écran qui n'affiche pas de pièces n'a aucune raison
 * d'être réveillé quand une pièce est rangée.
 *
 * ⚠️ IL N'EST PAS UN CACHE, ET SURTOUT PAS UNE DONNÉE. Il ne transporte aucune carte : il dit « redemande ». La
 * vérité reste celle du serveur (`/api/admin/gestion/historique/parties`), et c'est elle qui s'affiche. Porter la
 * carte dans le signal aurait créé une seconde vérité, qui aurait divergé au premier refus du serveur.
 *
 * ⚠️ IL PORTE LA CLÉ DU BIEN, et c'est indispensable : deux fiches de biens peuvent être ouvertes dans deux
 * onglets — non, dans la MÊME page : le bloc « Historique » d'un bien et, un jour, une liste de biens. Un signal
 * sans clé ferait relire tout le monde à chaque geste.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que porte le signal : le bien touché, et rien d'autre. */
export interface SignalCartesContact {
  /** La clé WIPPIMMO du lot dont les cartes ont changé. */
  lotCle: string;
  /** Un compteur qui ne recule jamais : il permet à un auditeur de savoir qu'il a déjà vu ce signal. */
  tour: number;
}

export type AuditeurCartesContact = (s: SignalCartesContact) => void;

const auditeurs = new Set<AuditeurCartesContact>();
let tour = 0;

/**
 * S'abonner. Rend la fonction qui désabonne — à appeler au démontage, sinon un composant démonté continue d'être
 * appelé et React crie « setState sur un composant démonté ».
 */
export function ecouterCartesContact(f: AuditeurCartesContact): () => void {
  auditeurs.add(f);
  return () => { auditeurs.delete(f); };
}

/**
 * Annoncer qu'on vient de changer les cartes d'un bien.
 *
 * ⚠️ UN AUDITEUR QUI JETTE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS. Sans ce `try`, un seul écran en erreur
 * laisserait tous les suivants sur leur image d'avant — c'est-à-dire exactement le défaut qu'on répare.
 */
export function annoncerCartesContact(lotCle: string): void {
  const cle = lotCle.trim();
  if (cle === '') return;
  tour += 1;
  const s: SignalCartesContact = { lotCle: cle, tour };
  for (const f of [...auditeurs]) {
    try { f(s); } catch { /* un auditeur en erreur ne fait pas taire les autres */ }
  }
}

/**
 * Ce signal me concerne-t-il ? PUR.
 *
 * ⚠️ LA COMPARAISON EST INSENSIBLE AUX ESPACES, comme partout où ce dépôt compare une clé WIPPIMMO : la clé
 * arrive d'une URL ici, d'une colonne là, et un espace de bord ferait manquer une mise à jour sans rien dire.
 */
export function concerneCeBien(s: SignalCartesContact, lotCle: string): boolean {
  return s.lotCle.trim() === lotCle.trim() && s.lotCle.trim() !== '';
}

/** Remet le registre à zéro. RÉSERVÉ AUX ÉPREUVES : un écran n'a jamais à désabonner les autres. */
export function oublierLesAuditeursCartesContact(): void {
  auditeurs.clear();
}
