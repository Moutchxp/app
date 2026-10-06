/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — « CE MAIL QUITTE SA LISTE, MAINTENANT » ══════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Un registre d'auditeurs en mémoire du
 * navigateur — donc importable depuis un `'use client'` (règle du dépôt depuis l'incident du 24/09/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (06/10/2026) : « après la mise à la corbeille, le mail apparaît dans la Corbeille mais reste
 * visible dans la boîte quelques secondes. Il est aux deux endroits, ce qui est impossible et donne l'impression
 * que l'action a échoué. »
 *
 * ═══ 🔴🔴 CE QUE LE DIAGNOSTIC A TROUVÉ : DEUX CHEMINS, DEUX RETARDS ════════════════════════════════════════════
 *
 * ① DEPUIS LA BARRE DE SURVOL D'UNE LIGNE (`agirSurLigne`, plein écran) : on ATTEND la réponse du serveur, puis
 *    on relit la liste ENTIÈRE (`setVersionListe`). La ligne reste donc affichée pendant DEUX allers-retours —
 *    l'écriture, puis la relecture — et sans squelette, puisque l'écran garde l'ancienne liste le temps du
 *    retour (c'est un choix du lot LISTE-PAGINATION, et il est bon : un écran vide serait pire).
 *
 * ② DEPUIS LE MAIL OUVERT (la grande corbeille du bloc gris) : le message est masqué dans la conversation et les
 *    compteurs reçoivent leur delta — mais **la liste n'est prévenue de rien**. Son commentaire le disait :
 *    « la LIGNE quitte ses dossiers au battement suivant de l'écran vivant ». Ce battement vaut **30 secondes**
 *    (`rafraichir.ts`). D'où « il est aux deux endroits », et d'où « quelques secondes ».
 *
 * ═══ 🔴 LA RÈGLE D'ARNO, ET CE QUE CE SIGNAL EN TIENT ═══════════════════════════════════════════════════════════
 *
 * « Dans la même image, le mail QUITTE la liste de sa boîte, ENTRE dans la Corbeille (si elle est affichée), et
 * les compteurs se mettent à jour. L'enregistrement suit. Le mail n'est jamais visible aux deux endroits à la
 * fois. En cas d'échec, il revient à sa place, avec un message. Même règle pour “Réintégrer” et pour la
 * sélection multiple. »
 *
 * 🔴 UN SIGNAL, ET NON UN RAPPEL DE PLUS, pour la raison exacte de `signalEtoile` : les listes ne vivent pas dans
 * l'arbre de celui qui clique. La grande corbeille est dans `Conversation`, la liste dans `BoiteMail` ou dans
 * `BoiteReception`, et ces trois-là sont montés CÔTE À CÔTE, jamais l'un dans l'autre.
 *
 * 🔴 IL PART **AVANT** L'ÉCRITURE, et c'est tout le point : « dans la même image ». Puis il repart en sens
 * inverse si le serveur refuse — « il revient à sa place ». C'est la même discipline que l'étoile depuis ce lot,
 * et pour la même raison : un état anticipé qui ne sait pas revenir est pire qu'un état en retard.
 *
 * ⚠️ IL NE DIT PAS « RECHARGE » : il dit CE QUI CHANGE, pour QUI. Une relecture serveur reste utile ensuite (les
 * compteurs exacts, la page suivante) — mais elle n'est plus ce qui fait disparaître la ligne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES TROIS GESTES DE LA CORBEILLE, nommés comme la route les nomme (`/api/admin/gestion/corbeille`).
 *
 * ⚠️ `supprimer` EST LÀ PARCE QU'ELLE FAIT AUSSI QUITTER UNE LISTE — celle de la Corbeille. L'omettre aurait
 * laissé la suppression définitive attendre sa relecture, c'est-à-dire exactement le défaut qu'on répare, à
 * l'endroit où il se voit le plus (la liste est courte, la ligne saute aux yeux).
 */
export type ActionCorbeille = 'corbeille' | 'reintegrer' | 'supprimer';

/**
 * Ce que porte le signal.
 *
 * ⚠️ LES DEUX DÉSIGNATIONS COEXISTENT, et il le faut : la corbeille d'un ÉCHANGE vise des `filIds` (barre de
 * survol, sélection multiple de la Corbeille), celle d'un MESSAGE vise des `messageIds` (grande corbeille du bloc
 * gris). Les confondre obligerait l'écran à traduire l'un en l'autre — ce que seul le serveur sait faire.
 */
export interface SignalCorbeille {
  filIds: readonly number[];
  messageIds: readonly number[];
  action: ActionCorbeille;
  /**
   * 🔴 VRAI QUAND C'EST UN RETOUR EN ARRIÈRE — le serveur a refusé, et chaque liste doit REMETTRE ce qu'elle
   * venait de retirer. Sans ce drapeau, une liste ne saurait pas distinguer « on réintègre » (un geste) de
   * « l'envoi à la corbeille a échoué » (son annulation), et la Corbeille elle-même se tromperait de sens.
   */
  annule: boolean;
}

export type AuditeurCorbeille = (s: SignalCorbeille) => void;

/**
 * 🔴 UN `Set`, PAS UN TABLEAU : une liste démontée puis remontée (aller à la Corbeille et revenir) ne doit pas
 * laisser derrière elle un auditeur mort, et deux abonnements du même auditeur ne doivent pas masquer deux fois.
 */
const auditeurs = new Set<AuditeurCorbeille>();

/** S'ABONNER. Rend la fonction de désabonnement — le contrat d'un `useEffect`. */
export function ecouterCorbeille(a: AuditeurCorbeille): () => void {
  auditeurs.add(a);
  return () => { auditeurs.delete(a); };
}

/**
 * ANNONCER. Appelée par la porte d'écriture (`appelerCorbeille`), et par elle seule.
 *
 * ⚠️ UNE COPIE DU REGISTRE AVANT DE PARCOURIR : un auditeur qui se désabonne en se démontant pendant l'annonce
 * modifierait l'ensemble en cours de lecture.
 *
 * ⚠️ UN AUDITEUR QUI JETTE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS : une liste qui ne retire pas sa ligne ne
 * doit pas laisser les autres dans l'état d'avant — ce serait exactement le désaccord qu'on répare.
 */
export function annoncerCorbeille(s: SignalCorbeille): void {
  for (const a of [...auditeurs]) {
    try { a(s); } catch { /* une liste en faute ne fait pas taire les autres */ }
  }
}

/**
 * OÙ LE MAIL SE TROUVE APRÈS LE GESTE. Trois endroits, pas deux.
 *
 * 🔴 POURQUOI PAS UN BOOLÉEN « versLaCorbeille ». Première écriture de ce module, le signal ne portait que cela —
 * et `supprimer` s'y rangeait avec « vers la corbeille », ce qui donnait, dans la liste de la Corbeille : destination
 * corbeille, liste corbeille, donc « la ligne reste ». Faux : une suppression définitive la fait partir. Le
 * troisième endroit ne porte pas de nom dans l'interface justement parce qu'on n'y affiche rien — raison de plus
 * pour le nommer ici.
 *
 * ⚠️ UNE ANNULATION RENVOIE AU POINT DE DÉPART, et non à l'inverse du geste : l'échec d'une réintégration ET
 * l'échec d'une suppression ramènent tous deux dans la Corbeille, puisque c'est de là que les deux partaient.
 */
export type OuEstLeMail = 'corbeille' | 'boite' | 'neant';

export function ouVaLeMail(s: SignalCorbeille): OuEstLeMail {
  if (s.annule) return s.action === 'corbeille' ? 'boite' : 'corbeille';
  if (s.action === 'corbeille') return 'corbeille';
  return s.action === 'reintegrer' ? 'boite' : 'neant';
}

/**
 * CETTE LIGNE DOIT-ELLE QUITTER LA LISTE AFFICHÉE ? PUR.
 *
 * 🔴 LA RÈGLE TIENT EN UNE PHRASE, ET ELLE VIT ICI PLUTÔT QUE DANS CHAQUE LISTE : une ligne s'en va quand le
 * geste l'emmène ailleurs que dans le dossier qu'on regarde. Dans la Corbeille, c'est donc la RÉINTÉGRATION et la
 * SUPPRESSION qui font sortir ; partout ailleurs, c'est la MISE à la corbeille. Écrite deux fois, cette inversion
 * aurait fini à l'envers d'un côté — et une ligne réintégrée serait restée dans la Corbeille.
 */
export function ligneQuitteLaListe(s: SignalCorbeille, listeEstLaCorbeille: boolean): boolean {
  const ou = ouVaLeMail(s);
  if (ou === 'neant') return true;
  return listeEstLaCorbeille ? ou !== 'corbeille' : ou === 'corbeille';
}
