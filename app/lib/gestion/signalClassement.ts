/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « LE CLASSEMENT D'UN MAIL VIENT DE CHANGER » ═════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Il ne porte qu'un registre d'auditeurs en
 * mémoire du navigateur — donc importable depuis un `'use client'` (règle du dépôt depuis l'incident du
 * 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Si le mail n'a plus AUCUN bien : il repasse “À classer” dans la boîte (pas
 * Interne), et les compteurs du menu de gauche se mettent à jour. La fenêtre “Visualiser / Modifier” du mail
 * reflète le changement. »
 *
 * 🔴 POURQUOI UN SIGNAL, ET NON UN RAPPEL DE PLUS. Le geste part de l'HISTORIQUE D'UN BIEN, qui vit au fond de
 * l'écran « Annuaire » : `GestionVue` → `Annuaire` → `VueLot` → `HistoriqueDuBien`. Les compteurs, eux, vivent
 * tout en haut, dans `GestionVue` (`rafraichirComptes`). Faire descendre un rappel à travers trois composants
 * aurait ajouté une propriété à chacun — dont `VueLot` et `Annuaire`, qui n'ont rien à voir avec le classement —
 * et il aurait fallu la recâbler le jour où un quatrième écran offrira le même geste.
 *
 * ⚠️ IL NE TRANSPORTE AUCUN NOMBRE, ET SURTOUT PAS UN DELTA. Il dit « un mail a changé de classement, redemande
 * tes chiffres ». Deviner le delta aurait demandé de savoir si ce mail avait, ou non, d'autres biens, et si son
 * échange porte une marque « interne » — trois questions auxquelles seul le serveur répond juste. C'est déjà le
 * parti de `signalPieceDrive`, et pour la même raison.
 *
 * ⚠️ LE `messageId` VOYAGE QUAND MÊME : une fenêtre ouverte SUR CE MAIL (« Visualiser / Modifier ») doit pouvoir
 * se relire sans que les autres écrans aient à le faire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que porte le signal : le mail dont le classement vient de changer. */
export interface SignalClassement {
  messageId: number;
  /** L'échange du mail, quand on le connaît — une fenêtre ouverte sur le fil s'en sert pour se relire. */
  filId: number | null;
}

export type AuditeurClassement = (s: SignalClassement) => void;

/**
 * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte (l'ouverture d'une fiche) ne doit pas
 * laisser derrière lui un auditeur mort, et deux abonnements du même auditeur ne doivent pas faire deux lectures.
 */
const auditeurs = new Set<AuditeurClassement>();

/** S'ABONNER. Rend la fonction de désabonnement — c'est le contrat d'un `useEffect`. */
export function ecouterClassement(a: AuditeurClassement): () => void {
  auditeurs.add(a);
  return () => { auditeurs.delete(a); };
}

/**
 * ANNONCER, une fois l'écriture CONFIRMÉE par le serveur.
 *
 * ⚠️ UNE COPIE DU REGISTRE AVANT DE PARCOURIR, et un auditeur en faute ne fait pas taire les autres : des
 * compteurs qui ne se rafraîchissent pas valent mieux qu'un écran qui tombe.
 */
export function annoncerClassement(s: SignalClassement): void {
  for (const a of [...auditeurs]) {
    try { a(s); } catch { /* un écran en faute ne fait pas taire les autres */ }
  }
}
