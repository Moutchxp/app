/**
 * MODULE « GESTION » — LOT HISTORIQUE-BIEN-1 : DE QUI CETTE ADRESSE EST-ELLE LE CONTACT ?
 *
 * 🔴 MODULE PUR. Aucune base, aucun réseau, aucun React, aucun `server-only` : il est lu par le navigateur ET par
 * le serveur, et il doit répondre pareil des deux côtés. C'est aussi pour cela que LA RÈGLE N'EST ÉCRITE QU'ICI —
 * une règle recopiée à trois endroits dérive en silence, et l'écart ne se voit que le jour où deux écrans se
 * contredisent sur le même bien (précédent du lot RENOMMER-PARTOUT, point 4 : la modale lisait les fenêtres, la
 * liste la marque d'échange, et les deux se contredisaient sur 3 conversations).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ARNO A DÉCIDÉ (04/10/2026) — TROIS CATÉGORIES DE PARTIES, ET UN CONTACT N'EST JAMAIS UN CLIENT.
 *
 *   · côté PROPRIÉTAIRE : le(s) propriétaire(s) — des CLIENTS, qui vivent dans l'annuaire — PLUS les CONTACTS du
 *     propriétaire, qui sont ce que ce module range ;
 *   · côté LOCATAIRE : le locataire en place et les anciens locataires (des CLIENTS) PLUS les CONTACTS du locataire ;
 *   · INDÉPENDANT : diagnostiqueurs, artisans, prestataires, syndics, autres agences. Catégorie **GLOBALE** :
 *     rangée UNE FOIS pour tous les biens, et **JAMAIS rattachée à un bien** ;
 *   · « À RÉPARTIR » : on ne sait pas encore, et on le DIT plutôt que de deviner.
 *
 * 🔴🔴 UN CONTACT N'EST PAS UN CLIENT, et cette phrase a des conséquences vérifiables : il n'est JAMAIS compté dans
 * « PROPRIÉTAIRE N » ni dans « LOCATAIRE EN PLACE N », il ne reçoit JAMAIS le statut ni le badge de propriétaire ou
 * de locataire, et il ne change RIEN à la détermination du locataire à une date (`roleLocataireALaDate`, qui ne lit
 * que les occupations de l'annuaire). Ce module ne fournit donc AUCUNE fonction qui rendrait un compteur de clients
 * ou un rôle : il n'y a rien ici à brancher par erreur sur une fiche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES TROIS CATÉGORIES, ET UNE LISTE D'ATTENTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `proprietaire` · `locataire` — contact de cette partie, SUR UN BIEN précis.
 * `independant`               — prestataire : catégorie GLOBALE, jamais rattachée à un bien.
 * `a_repartir`                — pas encore tranché. Un aveu, pas une devinette.
 */
export type Categorie = 'proprietaire' | 'locataire' | 'independant' | 'a_repartir';

/**
 * D'où vient le rangement :
 *   · `defaut`  — la règle à trois étages a tranché (étages ② et ③) ;
 *   · `propose` — la règle PROPOSE un indépendant, et le dit « à vérifier » (étage ①) ;
 *   · `manuel`  — quelqu'un a décidé. 🔴 CELLE-LÀ L'EMPORTE TOUJOURS, et aucune reprise ne l'écrase.
 */
export type Origine = 'defaut' | 'propose' | 'manuel';

/** Le côté d'un bien où une carte de contact s'affiche. Il n'y en a que deux : un indépendant n'a pas de carte. */
export type Cote = 'proprietaire' | 'locataire';

/** Une catégorie rangée, telle qu'une ligne vivante de `gestion_partie_categorie` la porte. */
export interface CategorieRangee {
  categorie: Categorie;
  origine: Origine;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA RÈGLE PAR DÉFAUT, À TROIS ÉTAGES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface SignauxDeLAdresse {
  /**
   * SUR COMBIEN DE BIENS cette adresse apparaît-elle, parmi les paires (bien, adresse) à ranger ? C'est LE signal
   * qui distingue un prestataire d'un contact de client, et il est net (voir l'encadré de `categorieParDefaut`).
   */
  biensDeLAdresse: number;
  /** Participe-t-elle à une même conversation (`fil_id`) que le PROPRIÉTAIRE de ce bien ? */
  parleAvecProprietaire: boolean;
  /** Participe-t-elle à une même conversation (`fil_id`) que le LOCATAIRE de ce bien ? */
  parleAvecLocataire: boolean;
}

/**
 * ══ 🔴🔴 LA RÈGLE PAR DÉFAUT — TROIS ÉTAGES, DANS CET ORDRE ═══════════════════════════════════════════════════════
 *
 *   ① l'adresse apparaît sur PLUSIEURS biens  → `independant`, origine `propose` (« à vérifier ») ;
 *   ② elle n'apparaît que sur UN SEUL bien    → `proprietaire` ou `locataire`, selon qu'elle parle avec l'un ou
 *                                               avec l'autre, origine `defaut` ;
 *   ③ elle parle avec LES DEUX, ou avec AUCUN → `a_repartir`, origine `defaut`.
 *
 * ═══ 🔴 POURQUOI L'ÉTAGE ① PASSE AVANT, ET IL A ÉTÉ MESURÉ AVANT D'ÊTRE ÉCRIT ═════════════════════════════════════
 *
 * La règle des conversations, appliquée SEULE, donnait 750 cartes — et se trompait sur un cas entier : elle
 * fabriquait des « contacts du propriétaire » à partir de prestataires qui travaillent pour nous sur des dizaines
 * de biens. Mesuré le 04/10/2026, en lecture seule : `gdsproprete@gmail.com` (société de ménage) sur **40 biens**,
 * `assistance@wipimo.fr` (l'éditeur du logiciel) sur **31**, `a.bruneel@grospiron.com` (déménageur),
 * `jcordel@mavimmo.fr` (une autre agence). **65 adresses sur 640 expliquaient 312 des 887 paires.**
 *
 * Mettre l'étage ① en premier sort ces 312 paires du mauvais tiroir, et ramène les cartes de 750 à **485**.
 *
 * ⚠️ L'ÉTAGE ① PROPOSE, IL NE TRANCHE PAS (`origine: 'propose'`). « Plusieurs biens » est un signal fort, pas une
 * preuve : un propriétaire qui possède trois logements chez nous a lui aussi plusieurs biens. On le dit donc
 * « à vérifier », et le garde ci-dessous fait en sorte qu'un indépendant PROPOSÉ ne serve à rien d'automatique en
 * attendant — ni après vérification, d'ailleurs.
 *
 * ⚠️ « AUCUN DES DEUX » N'EST PAS UNE ERREUR DE DONNÉES, et il ne faut pas le ranger par défaut d'un côté : mesuré,
 * `sandeep.chawla@capgemini.com` sur le lot 119 ne parle ni avec le propriétaire ni avec le locataire. Le ranger
 * « côté propriétaire faute de mieux » aurait inventé une relation. `a_repartir` dit la vérité.
 */
export function categorieParDefaut(s: SignauxDeLAdresse): CategorieRangee {
  /* ① PLUSIEURS BIENS → indépendant PROPOSÉ. Avant tout le reste, exprès. */
  if (s.biensDeLAdresse > 1) return { categorie: 'independant', origine: 'propose' };

  /* ② UN SEUL BIEN → le côté avec lequel elle parle, s'il n'y en a qu'un. */
  if (s.parleAvecProprietaire && !s.parleAvecLocataire) return { categorie: 'proprietaire', origine: 'defaut' };
  if (s.parleAvecLocataire && !s.parleAvecProprietaire) return { categorie: 'locataire', origine: 'defaut' };

  /* ③ LES DEUX, OU AUCUN → à répartir. */
  return { categorie: 'a_repartir', origine: 'defaut' };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LA RÉSOLUTION : LE MANUEL L'EMPORTE, PUIS LE PLUS SPÉCIFIQUE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CategoriesConnues {
  /** La catégorie rangée POUR CE BIEN (`lot_cle` non nul), s'il y en a une vivante. */
  parBien: CategorieRangee | null;
  /** La catégorie GLOBALE de l'adresse (`lot_cle IS NULL`), s'il y en a une vivante. Toujours `independant`. */
  globale: CategorieRangee | null;
}

/**
 * ══ 🔴🔴 CE QUI VAUT, QUAND DEUX LIGNES PARLENT DE LA MÊME ADRESSE ════════════════════════════════════════════════
 *
 * Deux lignes peuvent coexister légitimement : une catégorie GLOBALE (« c'est un prestataire ») et une catégorie
 * PAR BIEN (« sur CE bien, c'est le contact du propriétaire »). L'ordre est :
 *
 *   ① LE MANUEL L'EMPORTE, d'où qu'il vienne. Une décision humaine ne se fait jamais recouvrir par une règle, même
 *      par une règle plus spécifique — c'est la promesse faite à qui prend le temps de ranger ;
 *   ② à égalité d'origine, LE PLUS SPÉCIFIQUE : la ligne du bien bat la ligne globale.
 *
 * ⚠️ POURQUOI ① AVANT ②, ET PAS L'INVERSE. Le cas réel : `jcordel@mavimmo.fr` est une autre agence, rangée
 * `independant` À LA MAIN en global. Si le « plus spécifique » passait avant, la proposition par défaut posée sur
 * le lot 504 la ferait redevenir « contact du propriétaire » sur ce bien — exactement l'erreur qu'on vient de
 * corriger à la main. Le manuel global protège donc tous les biens d'un coup, ce qui est le but de la catégorie.
 *
 * ⚠️ DEUX MANUELS NE S'ANNULENT PAS : si les deux lignes sont manuelles, c'est le PLUS SPÉCIFIQUE qui gagne — on a
 * dit « en général c'est un prestataire, MAIS sur ce bien précis c'est le contact du propriétaire », et c'est une
 * phrase cohérente, souvent vraie (le gardien de l'immeuble du lot 155).
 *
 * Rend `null` quand personne ne s'est prononcé : l'appelant applique alors `categorieParDefaut`.
 */
export function categorieRetenue(c: CategoriesConnues): CategorieRangee | null {
  const manuelBien = c.parBien?.origine === 'manuel' ? c.parBien : null;
  const manuelGlobal = c.globale?.origine === 'manuel' ? c.globale : null;
  /* ① LE MANUEL D'ABORD — le plus spécifique des manuels s'il y en a deux. */
  if (manuelBien !== null || manuelGlobal !== null) return manuelBien ?? manuelGlobal;
  /* ② PUIS LE PLUS SPÉCIFIQUE. */
  return c.parBien ?? c.globale ?? null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔒🔒 LE GARDE : UN INDÉPENDANT NE SERT JAMAIS À L'AUTOMATISATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔒🔒 CETTE ADRESSE PEUT-ELLE SERVIR À DÉDUIRE QUOI QUE CE SOIT ? ══════════════════════════════════════════════
 *
 * 🔴 `false` POUR `independant`, PROPOSÉ COMME VÉRIFIÉ. C'est le garde le plus important du lot, et il ne dépend
 * PAS de l'origine : ni `propose`, ni `defaut`, ni `manuel` ne l'ouvrent. Aucune déduction de bien à partir de
 * l'adresse d'un prestataire, aucun rattachement automatique.
 *
 * POURQUOI, EN UNE MESURE. `gdsproprete@gmail.com` est sur **40 biens** ; `assistance@wipimo.fr` sur **31** ;
 * `noreply@emailing.caf.fr` sur **12**. Une automatisation qui accepterait de déduire un bien de l'une de ces
 * adresses rattacherait chaque mail de la société de ménage à quarante logements — ou, pire, au premier qu'elle
 * trouve. C'est la raison d'être de la catégorie, pas un effet de bord.
 *
 * ⚠️ POURQUOI « VÉRIFIÉ » NE CHANGE RIEN. Vérifier un indépendant veut dire « oui, c'est bien un prestataire » :
 * la vérification CONFIRME qu'il ne faut pas s'en servir. L'intuition inverse (« vérifié = de confiance = on peut
 * automatiser ») est exactement l'erreur que ce commentaire existe pour empêcher.
 *
 * ⚠️ `a_repartir` REND `false` AUSSI, et pour une autre raison : on ne sait pas encore de qui c'est le contact,
 * donc on ne déduit rien. Une automatisation sur « à répartir » devinerait au hasard entre deux parties.
 */
export function sertALAutomatisation(categorie: Categorie): boolean {
  return categorie === 'proprietaire' || categorie === 'locataire';
}

/**
 * LE CÔTÉ OÙ CETTE CATÉGORIE S'AFFICHE, ou `null` quand elle ne s'affiche sur aucun bien.
 *
 * 🔴 `independant` ET `a_repartir` RENDENT `null`, ET C'EST LA MÊME RÈGLE QUE CI-DESSUS VUE DE L'ÉCRAN : aucune
 * carte n'est créée pour eux. Un indépendant n'est rattaché à aucun bien ; un « à répartir » attend qu'on tranche.
 */
export function coteDeLaCategorie(categorie: Categorie): Cote | null {
  return categorie === 'proprietaire' || categorie === 'locataire' ? categorie : null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LES LIBELLÉS VISIBLES — ÉCRITS UNE FOIS, ICI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ CES MOTS SONT CEUX D'ARNO, AU MOT PRÈS, et ils vivent ici pour une raison : l'écran, le script de reprise et
 * les tests doivent dire LA MÊME CHOSE. « Contact du propriétaire » n'est pas « Propriétaire » — la nuance est
 * précisément ce qui empêche de prendre un contact pour un client, et une paraphrase l'effacerait.
 */
export const LIBELLE_CONTACT_PROPRIETAIRE = 'CONTACT DU PROPRIÉTAIRE';
export const LIBELLE_CONTACT_LOCATAIRE = 'CONTACT DU LOCATAIRE';

/** L'étage ① de la règle, dit à l'écran : un signal fort, annoncé comme une proposition. */
export const LIBELLE_INDEPENDANT_PROPOSE = 'Indépendant proposé — à vérifier';

/**
 * LA TRAME D'UNE CARTE NÉE D'UNE PASSE, et elle promet DEUX choses parce que les deux manquent : vérifier (est-ce
 * bien le contact de cette partie ?) et compléter (le nom, le téléphone).
 *
 * ⚠️ MESURÉ, ET C'EST POUR CE CAS QUE « COMPLÉTER » EST DANS LA PHRASE : `rusanov_d@me.com` n'a JAMAIS écrit
 * (0 envoi, 29 fois en copie). Son nom ne figure dans aucun en-tête : sa carte naît avec la seule adresse.
 */
export const LIBELLE_CARTE_AUTO = 'Créée automatiquement — à vérifier et compléter';

/** Le libellé du côté d'une carte. Un seul endroit où le mot se choisit. */
export function libelleDuCote(cote: Cote): string {
  return cote === 'proprietaire' ? LIBELLE_CONTACT_PROPRIETAIRE : LIBELLE_CONTACT_LOCATAIRE;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LE REPLI DES CARTES AUTOMATIQUES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 AU-DELÀ DE SIX, ON REPLIE (décision d'Arno) ════════════════════════════════════════════════════════════════
 *
 * POURQUOI SIX, ET POURQUOI UN REPLI PLUTÔT QU'UNE LIMITE. Mesuré le 04/10/2026 : la médiane est de 1 à 2 cartes
 * par bien, 90 % des biens en ont 6 ou moins — et **le lot 155 en a 55**. Ce lot-là porte 130 mails et 41
 * conversations autour de « Re: 48 blvd mission Marchand — DDE », une affaire qui concerne tout l'immeuble, avec 31
 * adresses en `gmail.com`, 6 en `hotmail.com` et 4 en `yahoo.fr`. Ce ne sont pas 55 contacts du propriétaire : ce
 * sont les participants d'un dossier collectif. **55 cartes dans un carrousel seraient inutilisables.**
 *
 * 🔴 ON REPLIE, ON NE JETTE PAS. Les 55 cartes existent, elles sont simplement rangées derrière leur nombre : rien
 * n'est perdu, et le bien reste consultable. Une limite dure aurait fait disparaître des contacts réels sans que
 * personne sache lesquels.
 *
 * ⚠️ LE REPLI NE CONCERNE QUE LES CARTES CRÉÉES AUTOMATIQUEMENT. Les cartes VÉRIFIÉES à la main s'affichent
 * d'emblée, et les cartes CLIENTS (propriétaires, locataires) ne changent pas d'un pixel : elles ne passent pas
 * par ce compte.
 */
export const SEUIL_REPLI_CARTES = 6;

/** Faut-il replier ? AU-DELÀ de six, donc sept et plus. Six cartes tiennent encore à l'écran. */
export function replierLesCartes(nombreDeCartesAuto: number): boolean {
  return nombreDeCartesAuto > SEUIL_REPLI_CARTES;
}

/**
 * LE MOT DU REPLI : « 7 contacts créés automatiquement — à vérifier ».
 *
 * ⚠️ LE SINGULIER EST GÉRÉ MAIS N'ARRIVE JAMAIS EN PRATIQUE : on ne replie qu'au-delà de six. Il est écrit quand
 * même, parce qu'un libellé qui dit « 1 contacts » est le genre de détail qui fait douter de tout le reste.
 */
export function motCartesRepliees(nombreDeCartesAuto: number): string {
  const n = Math.max(0, Math.trunc(nombreDeCartesAuto));
  return n <= 1
    ? `${n} contact créé automatiquement — à vérifier`
    : `${n} contacts créés automatiquement — à vérifier`;
}
