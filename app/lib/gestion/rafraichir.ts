/**
 * MODULE « GESTION » — LOT ÉCRAN-VIVANT : L'ÉCRAN SE MET-IL À JOUR TOUT SEUL ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT QUE CE MODULE RÉPARE — CONSTATÉ LE 26/09/2026. Arno signale « la relève automatique toutes les minutes
 * ne fonctionne pas ». Mesuré : elle fonctionnait parfaitement — 83 messages dans le dossier de gestion depuis la
 * veille, 83 en base, aucun manquant. C'est l'ÉCRAN qui ne bougeait pas : il se chargeait UNE FOIS au montage, et
 * plus jamais. Le bandeau disait « dernière passe il y a 46 s » parce que c'était vrai AU CHARGEMENT, et il l'a
 * répété indéfiniment ; la liste de la Réception restait figée sur le dernier mail connu à ce moment-là.
 *
 * Un écran figé qui affiche une heure figée est indiscernable d'une relève arrêtée. La conclusion d'Arno était la
 * seule que ce qu'il voyait permettait de tirer.
 *
 * ═══ 🔴 DEUX HORLOGES, ET IL FAUT LES DEUX ══════════════════════════════════════════════════════════════════════
 * ① L'INSTANT DE RÉFÉRENCE (`maintenant`) doit avancer même quand RIEN n'a changé : sans cela « il y a 46 s » reste
 *    écrit une heure plus tard. Il ne coûte rien — aucune requête, juste une nouvelle date.
 * ② LES DONNÉES ne se rechargent QUE si quelque chose a changé, et on le sait par une EMPREINTE de 1,2 ms au lieu de
 *    relire tout l'écran. Recharger toutes les 30 secondes « au cas où » ferait payer la lecture complète — file,
 *    cartes, compteurs, veille — 120 fois par heure, pour la même image.
 *
 * ═══ 🔴 CE QUI NE DOIT JAMAIS REVENIR : LA BOUCLE DE RENDU ═══════════════════════════════════════════════════════
 * Une boucle de rendu a saturé la mémoire dans `BoiteMail` (le correctif vit dans `GestionVue`, encadré `majNonLus`) :
 * un état recréé à chaque appel provoquait un rendu, qui rappelait l'effet, qui recréait l'état. La règle qui en
 * découle commande ce module : **on ne rend un objet NEUF que si la valeur a CHANGÉ**. `memeEmpreinte` est là pour
 * cela, et `empreinteSuivante` rend la MÊME référence quand rien n'a bougé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * CE QUI SUFFIT À SAVOIR QUE L'ÉCRAN A VIEILLI. Trois nombres, tous lus sur un index.
 *
 * ⚠️ ON NE MET PAS DE COMPTEUR DE LIGNES ICI. `count(*)` sur 56 805 messages est un balayage complet ; le plus grand
 * identifiant dit la même chose (un message de plus ⇒ un identifiant de plus) pour un millième du coût.
 *
 * ⚠️ ET ON NE CHERCHE PAS À DÉTECTER CE QUE L'ÉCRAN VIENT DE FAIRE LUI-MÊME. Classer, détacher, rattacher passent
 * déjà par un rechargement explicite. L'empreinte sert à voir ce qui arrive DE L'EXTÉRIEUR — le courrier, et les
 * passes de la relève automatique.
 */
export interface Empreinte {
  /** Le plus grand identifiant de message. Change dès qu'un mail est capturé. */
  messageMax: number;
  /** Le plus grand identifiant d'échange. Change dès qu'un fil neuf apparaît. */
  filMax: number;
  /** L'identifiant de la dernière passe automatique terminée. Change à chaque passe — donc chaque minute. */
  passeId: number;
}

export const EMPREINTE_VIDE: Empreinte = { messageMax: 0, filMax: 0, passeId: 0 };

/**
 * PÉRIODE DU BATTEMENT. 30 secondes : la relève tourne chaque minute, donc un battement deux fois plus rapide voit
 * chaque passe au plus 30 secondes après elle. Plus court ne rendrait rien de plus ; plus long laisserait le bandeau
 * annoncer « il y a 2 min » quand la passe a une minute.
 */
export const PERIODE_BATTEMENT_MS = 30_000;

/** Deux empreintes disent-elles la même chose ? PUR. */
export function memeEmpreinte(a: Empreinte, b: Empreinte): boolean {
  return a.messageMax === b.messageMax && a.filMax === b.filMax && a.passeId === b.passeId;
}

/**
 * L'EMPREINTE À GARDER, en rendant la MÊME RÉFÉRENCE quand rien n'a changé. PUR.
 *
 * 🔴 C'EST CE DÉTAIL QUI EMPÊCHE LA BOUCLE DE RENDU. Un `setEmpreinte({ … })` qui fabrique un objet neuf à chaque
 * battement provoque un rendu à chaque battement, même quand l'écran est identique — et tout effet qui dépend de
 * cette valeur repart. C'est exactement le mécanisme qui a saturé la mémoire dans `BoiteMail`.
 */
export function empreinteSuivante(avant: Empreinte, apres: Empreinte): Empreinte {
  return memeEmpreinte(avant, apres) ? avant : apres;
}

/**
 * FAUT-IL RECHARGER LES DONNÉES DE L'ÉCRAN ? PUR.
 *
 * ⚠️ UNE PASSE QUI TOURNE SANS RIEN CAPTURER NE JUSTIFIE PAS DE RELIRE TOUT L'ÉCRAN — mais elle change l'heure de la
 * dernière relève, que le bandeau affiche. On distingue donc deux besoins : `donnees` (relire la file, les cartes,
 * les compteurs) et `bandeau` (relire seulement l'heure). Les confondre ferait relire 56 000 messages chaque minute
 * pour déplacer une phrase de quelques secondes.
 */
export function aRafraichir(avant: Empreinte | null, apres: Empreinte): { donnees: boolean; bandeau: boolean } {
  if (avant === null) return { donnees: false, bandeau: false };  // première mesure : rien à comparer
  const donnees = avant.messageMax !== apres.messageMax || avant.filMax !== apres.filMax;
  return { donnees, bandeau: donnees || avant.passeId !== apres.passeId };
}

/**
 * PEUT-ON RAFRAÎCHIR MAINTENANT SANS DÉRANGER ? PUR.
 *
 * 🔴 ON NE TOUCHE À RIEN PENDANT QU'UN GESTE EST EN VOL. Une relève lancée à la main, un classement en cours, un
 * chargement déjà parti : recharger par-dessus ferait deux lectures concurrentes et, pire, pourrait remettre à
 * l'écran la liste d'AVANT le geste qu'on vient de faire.
 *
 * ⚠️ ET PAS QUAND L'ONGLET EST CACHÉ. Un onglet en arrière-plan n'a personne devant lui : battre pour rien coûte une
 * requête toutes les 30 secondes, et le navigateur ralentit de toute façon les minuteries des onglets cachés — ce qui
 * rendrait l'heure affichée fausse au retour. On bat donc à nouveau au moment où l'onglet redevient visible.
 */
export function peutBattre(o: {
  visible: boolean;
  chargementEnCours: boolean;
  gesteEnCours: boolean;
  releveEnCours: boolean;
}): boolean {
  return o.visible && !o.chargementEnCours && !o.gesteEnCours && !o.releveEnCours;
}

/**
 * LA LISTE DE LA BOÎTE PEUT-ELLE ÊTRE RECHARGÉE SANS RIEN PERDRE ? PUR.
 *
 * 🔴 ON NE DÉTRUIT JAMAIS LE TRAVAIL EN COURS. Une recherche tapée, des pages supplémentaires chargées par
 * « Voir plus », une sélection : tout cela disparaîtrait d'un rechargement de la première page. Dans ces cas, l'écran
 * ANNONCE le courrier nouveau et laisse la personne décider — ce qui est aussi utile, et jamais brutal.
 *
 * ⚠️ UN MAIL OUVERT N'EMPÊCHE PAS DE RAFRAÎCHIR LA LISTE derrière lui : la conversation vit dans son propre
 * composant, avec ses propres données, et rien ne la remonte tant que l'échange ouvert ne change pas.
 */
export function listePeutSeRecharger(o: {
  rechercheEnCours: boolean;
  pagesSupplementaires: boolean;
  selectionEnCours: boolean;
}): boolean {
  return !o.rechercheEnCours && !o.pagesSupplementaires && !o.selectionEnCours;
}

/** Ce que l'écran annonce quand il a vu du courrier nouveau mais ne peut pas recharger sans rien perdre. PUR. */
export function mentionCourrierNouveau(combien: number): string {
  if (combien <= 0) return '';
  return combien === 1
    ? 'Un message est arrivé depuis l’ouverture de cette liste.'
    : `${combien} messages sont arrivés depuis l’ouverture de cette liste.`;
}
