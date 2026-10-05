/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — « L'ÉTOILE DE CET ÉCHANGE VIENT DE CHANGER » ═════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Il ne porte qu'un registre d'auditeurs en
 * mémoire du navigateur — donc importable depuis un `'use client'` (règle du dépôt depuis l'incident du
 * 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « C'est la MÊME fonction et le MÊME état que l'étoile de la barre de survol des
 * lignes et que l'étoile rouge affichée sur la ligne : une seule porte d'écriture, un seul état. Cliquer l'une
 * allume ou éteint les trois en direct (ligne, barre de survol, mail ouvert), dans les deux sens. »
 *
 * 🔴 POURQUOI UN SIGNAL, ET NON UN RAPPEL DE PLUS DANS LES PROPRIÉTÉS. Les trois étoiles ne vivent pas dans le
 * même arbre : la ligne et sa barre de survol sont dans `BoiteMail`, le mail ouvert dans `Conversation` — et
 * `Conversation` est montée à CÔTÉ de `BoiteMail` (écran partagé : `GestionVue` ; plein écran :
 * `PleinEcranBoite`), jamais dedans. Faire redescendre un état commun aurait demandé de le remonter dans les
 * DEUX parents, puis de le recâbler à l'identique dans `CarteVive` — trois chemins à tenir d'accord, et un
 * quatrième écran à ne pas oublier le jour où il montrera une conversation.
 *
 * ═══ 🔴 CE SIGNAL PORTE UNE VALEUR, LÀ OÙ CELUI DES PIÈCES DIT SEULEMENT « REDEMANDE » ══════════════════════════
 *
 * `signalPieceDrive` ne transporte rien : l'emplacement d'une pièce est une donnée riche, que seul le serveur
 * connaît. L'étoile d'un échange, elle, est UN booléen, et la porte d'écriture le reçoit CONFIRMÉ par Gmail
 * (`issue.etoilee`, voir `basculerEtoileDuFil`). Le transporter évite une relecture à chaque clic — et surtout il
 * évite que les trois étoiles passent par un état intermédiaire différent chacune, le temps de la réponse.
 *
 * ⚠️ ON N'ANNONCE QUE CE QUI EST ÉCRIT. Rien n'est émis avant la réponse du serveur : une annonce optimiste ferait
 * s'allumer les trois étoiles sur un geste que Gmail peut refuser (droit retiré, connexion perdue), et la seule
 * qui aurait su le dire est celle qui a cliqué. Le bouton cliqué, lui, a le droit d'anticiper pour lui-même : il
 * sait aussi se remettre droit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que porte le signal : l'échange touché, et l'état que le serveur a CONFIRMÉ. */
export interface SignalEtoile {
  filId: number;
  etoilee: boolean;
}

export type AuditeurEtoile = (s: SignalEtoile) => void;

/**
 * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte (ouvrir puis refermer une
 * conversation) ne doit pas laisser derrière lui un auditeur mort, et deux abonnements du même auditeur ne
 * doivent pas faire deux mises à jour.
 */
const auditeurs = new Set<AuditeurEtoile>();

/**
 * S'ABONNER. Rend la fonction de désabonnement — c'est le contrat d'un `useEffect`, et le seul qui garantisse
 * qu'un écran démonté cesse d'être appelé.
 */
export function ecouterEtoile(a: AuditeurEtoile): () => void {
  auditeurs.add(a);
  return () => { auditeurs.delete(a); };
}

/**
 * ANNONCER. Appelée par la porte d'écriture (`gesteEtoileFil`), et par elle seule.
 *
 * ⚠️ UNE COPIE DU REGISTRE AVANT DE PARCOURIR : un auditeur qui se désabonne en se démontant pendant l'annonce
 * modifierait l'ensemble en cours de lecture.
 *
 * ⚠️ UN AUDITEUR QUI JETTE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS : une étoile qui ne s'allume pas sur un écran
 * ne doit pas laisser les deux autres dans l'état d'avant — ce serait précisément le désaccord qu'on répare.
 */
export function annoncerEtoile(s: SignalEtoile): void {
  for (const a of [...auditeurs]) {
    try { a(s); } catch { /* un écran en faute ne fait pas taire les autres */ }
  }
}
