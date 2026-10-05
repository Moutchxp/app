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

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — LES MÊMES DEUX MOTS, EN PHRASE ════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Au clic, un petit choix : côté propriétaire, “Propriétaire (client)” ou “Contact du
 * propriétaire” ; côté locataire, “Occupant (client)” ou “Contact du locataire”. »
 *
 * 🔴 CE SONT LES BADGES, ÉCRITS COMME ON LES LIT DANS UNE PHRASE. Le badge d'une carte est en capitales parce
 * qu'il est une étiquette ; un bouton, lui, se lit. Les DÉRIVER du badge plutôt que de les retaper garantit qu'on
 * ne pourra pas, un jour, proposer « Contact du bailleur » sur un bouton pendant que la carte dit « CONTACT DU
 * PROPRIÉTAIRE ».
 */
function enPhrase(libelle: string): string {
  const bas = libelle.toLocaleLowerCase('fr');
  return bas.charAt(0).toLocaleUpperCase('fr') + bas.slice(1);
}

export const LIBELLE_CONTACT_PROPRIETAIRE_COURT = enPhrase(LIBELLE_CONTACT_PROPRIETAIRE);
export const LIBELLE_CONTACT_LOCATAIRE_COURT = enPhrase(LIBELLE_CONTACT_LOCATAIRE);

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

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DANS LES CARROUSELS DU HAUT ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026) : « le “+” sert à enrichir le carrousel de la partie concernée. Les cartes de
 * contact s'affichent donc dans les carrousels du haut de fiche. »
 *
 * 🔴 CE QUE CE LOT RÉPARE, ET C'EST MOI QUI L'AVAIS SIGNALÉ À LA FIN DU LOT 6. Les libellés ci-dessus
 * (`LIBELLE_CONTACT_PROPRIETAIRE`, `LIBELLE_CONTACT_LOCATAIRE`) existaient et étaient éprouvés depuis le lot 1,
 * mais AUCUN ÉCRAN NE LES RENDAIT : une carte créée par le « + » n'était visible que comme capsule dans le bloc du
 * bas. Le geste avait donc un effet invisible — c'est le pire genre de geste.
 *
 * ⚠️ LES DEUX RÈGLES DE COMPTAGE SONT ICI, ET ELLES NE SE MÊLENT PAS. Le compteur du titre
 * (« PROPRIÉTAIRE 1 ») ne compte QUE les clients ; les contacts ont le leur (« + 2 contacts »). Arno l'écrit en
 * toutes lettres, et il a raison : un carrousel qui annoncerait « PROPRIÉTAIRE 3 » pour un propriétaire et deux
 * contacts dirait que ce bien a trois propriétaires. C'est exactement le défaut qu'un compteur doit empêcher.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 1 — SEULE UNE CARTE **CRÉÉE** MONTE DANS UN CARROUSEL ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « Les cartes pré-remplies automatiquement (lots 1 et 2, environ 485) ne sont PLUS
 * affichées dans les carrousels du haut. Elles deviennent de simples PRÉ-REMPLISSAGES du formulaire du “+”. Rien
 * n'est supprimé : distingue-les par un état (ex. 'proposee' contre 'creee') […] Une carte apparaît dans le
 * carrousel PROPRIÉTAIRE ou LOCATAIRE uniquement quand Arno l'a validée par le “+”. »
 *
 * 🔴 AUCUNE MIGRATION N'EST NÉCESSAIRE, ET C'EST LA MESURE QUI LE DIT. La colonne `origine` de
 * `gestion_contact_carte` (migration 304) porte DÉJÀ exactement cette distinction :
 *   · `'auto'`   — née d'une passe de reprise. C'est le PRÉ-REMPLISSAGE d'Arno : personne ne l'a validée.
 *   · `'manuel'` — née d'un geste humain, c'est-à-dire du « + ». C'est la carte CRÉÉE d'Arno.
 *
 * MESURÉ EN BASE LE 05/10/2026 : **481 cartes `auto`** sur 162 biens, et **4 cartes `manuel`** sur 3 biens. Les
 * 481 `auto` n'ont **jamais été vérifiées par un humain** (zéro `verifie_le`), donc aucune n'est « déjà validée à
 * la main » — la règle d'Arno n'a pas d'exception à traiter. Et la contrainte de la table l'écrit déjà :
 * `origine = 'manuel'` interdit un auteur « automatique » (`gestion_contact_carte_auteur_chk`).
 *
 * ⚠️ AJOUTER UNE COLONNE `etat` AURAIT FAIT DEUX VÉRITÉS pour une seule idée, et c'est la pire façon de tenir un
 * état : deux colonnes à garder d'accord, sur 485 lignes, dont l'une serait déduite de l'autre. Arno m'avait
 * donné l'accord pour une migration additive « si besoin » ; il n'y en a pas besoin, et je le dis plutôt que de
 * l'écrire pour faire bonne mesure.
 *
 * ⚠️ RIEN N'EST SUPPRIMÉ NI MÊME RETIRÉ : les 481 cartes `auto` restent en base, actives, et continuent de servir
 * à ce pour quoi elles valent — pré-remplir le formulaire du « + » (lot 6) et nourrir le cas (f) de
 * l'automatisation (lot 6 également, comportement inchangé : il ne coche rien d'office).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'état d'une carte, dans les mots d'Arno. Dérivé de `origine`, jamais stocké deux fois. */
export type EtatDeCarte = 'proposee' | 'creee';

export function etatDeLaCarte(origine: 'auto' | 'manuel'): EtatDeCarte {
  return origine === 'manuel' ? 'creee' : 'proposee';
}

/**
 * Cette carte monte-t-elle dans un carrousel ? PUR.
 *
 * 🔴 C'EST LE SEUL JUGE, et il est nommé : l'écran du haut, le compteur « + N contacts » et la pastille de la
 * capsule l'appellent tous. Trois conditions écrites séparément auraient fini par diverger — et c'est le
 * carrousel qui aurait gardé une carte que la capsule croyait absente.
 */
export function carteMonteAuCarrousel(c: { origine: 'auto' | 'manuel' }): boolean {
  return etatDeLaCarte(c.origine) === 'creee';
}

/**
 * Le petit compteur des contacts d'un carrousel. `null` quand il n'y en a aucun : « + 0 contact » serait du bruit.
 *
 * ⚠️ LE « + » DU LIBELLÉ EST UN SIGNE D'ADDITION, PAS UN BOUTON : il dit « en plus des clients ci-contre ». C'est
 * ce qui empêche de lire ce nombre comme le compteur du titre.
 */
export function motContactsDuCarrousel(n: number): string | null {
  const c = Math.max(0, Math.trunc(n));
  if (c === 0) return null;
  return c === 1 ? '+ 1 contact' : `+ ${c} contacts`;
}

/**
 * ══ 🔴🔴 COMBIEN DE CARTES DE CONTACT ON MONTRE D'ABORD, ET CE QUE DIT LE RESTE ══════════════════════════════════
 *
 * RÈGLE D'ARNO : « Si un côté a beaucoup de contacts (dossier collectif, ex. bien 155 : 55), seules les 6
 * premières cartes s'affichent, puis une carte “Voir les N autres contacts”, qui déplie. »
 *
 * 🔴 SIX, ET LE NOMBRE EST NOMMÉ ICI PLUTÔT QU'ÉCRIT DANS L'ÉCRAN. MESURÉ : le bien 155 porte **55 contacts** côté
 * propriétaire. Cinquante-cinq cartes dans une piste horizontale, ce n'est pas un carrousel, c'est un mur : on
 * fait défiler sans jamais savoir ce qu'on cherche, et les cartes CLIENTS — celles qu'on vient voir — se
 * retrouvent noyées au bout d'un ruban de six écrans de large.
 *
 * ⚠️ LA BORNE NE CACHE RIEN : la carte « Voir les N autres contacts » DIT le nombre et déplie sur place. Un
 * carrousel qui s'arrêterait à six sans le dire ferait croire que le bien n'a que six contacts — et c'est ce
 * genre de silence qui fait rouvrir un dossier pour rien.
 */
export const CONTACTS_MONTRES = 6;

/** Le mot de la carte qui déplie le reste. `null` quand tout est déjà montré. */
export function motAutresContacts(total: number, montres = CONTACTS_MONTRES): string | null {
  const reste = Math.max(0, Math.trunc(total) - Math.max(0, Math.trunc(montres)));
  if (reste === 0) return null;
  return reste === 1 ? 'Voir le dernier contact' : `Voir les ${reste} autres contacts`;
}

/** Le mot qui replie. Écrit ici pour que les deux états d'un même bouton vivent au même endroit. */
export const MOT_REPLIER_CONTACTS = 'Masquer les contacts dépliés';

/**
 * ══ 🔴🔴 CE QU'UN CONTACT N'EST **JAMAIS** ════════════════════════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO : « Un contact ne reçoit jamais le badge PROPRIÉTAIRE ni EN PLACE, et ne compte jamais comme
 * occupant. »
 *
 * 🔴 CE GARDE EST ÉCRIT COMME UNE FONCTION, ET NON COMME UN COMMENTAIRE, pour qu'une épreuve puisse le tenir. Le
 * jour où quelqu'un passera le rôle d'un client à une carte de contact, c'est ici que ça se verra — et pas trois
 * mois plus tard sur une fiche où un artisan sera annoncé propriétaire du logement.
 */
export const ROLES_INTERDITS_AUX_CONTACTS: readonly string[] = ['PROPRIÉTAIRE', 'EN PLACE', 'LOCATAIRE'];

export function roleDeContactPermis(role: string): boolean {
  const r = role.trim().toUpperCase();
  /* Les libellés de contact CONTIENNENT le mot « PROPRIÉTAIRE » : on compare donc au libellé ENTIER, pas par
     inclusion — sans quoi « CONTACT DU PROPRIÉTAIRE » serait refusé par son propre garde. */
  return !ROLES_INTERDITS_AUX_CONTACTS.includes(r);
}

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
