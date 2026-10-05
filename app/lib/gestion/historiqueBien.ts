import { FUSEAU_AFFICHAGE } from './ecran';
import { formaterDateIso } from './annuaireRecherche';
import {
  ecrireFiltres, FILTRES_VIDES, jourValide, PAGE_HISTORIQUE,
  type ChoixPieces, type FiltresHistorique, type Interlocuteur, type LigneHistorique,
} from './historique';
import type { MessagePorteur, OrdrePieces } from './piecesConversation';
/**
 * 🔴🔴 LE SEUIL DE REPLI ET LE VOCABULAIRE DES CATÉGORIES VIENNENT DE `partieCategorie.ts`, ET DE LÀ SEULEMENT.
 *
 * Ce module-là est le juge du rangement des parties (livré par le chantier PARALLÈLE du même jour). Recopier son
 * `6` ou sa liste de catégories aurait fait deux vérités à tenir — et c'est toujours celle qu'on relit le moins
 * qui se périme. `replierLesCartes` porte même la comparaison (`> SEUIL`), ce qui ferme aussi l'erreur de borne.
 *
 * ⚠️ IL EST PUR ET N'IMPORTE RIEN : ce fichier-ci est atteint par le navigateur, et l'importer ne tire pas `pg`.
 */
import { coteDeLaCategorie, replierLesCartes, SEUIL_REPLI_CARTES, type Categorie } from './partieCategorie';

/**
 * MODULE « GESTION » — LOT HISTORIQUE-BIEN-1 : LES DÉCISIONS DU BLOC « HISTORIQUE » D'UNE FICHE DE BIEN. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND. « Montre-moi l'histoire de ce logement, pour la période qui m'intéresse, avec les personnes
 * qui m'intéressent. » Le bloc « Vie du bien » répond déjà à « tous ses mails » ; celui-ci répond à la question
 * d'APRÈS, celle qu'on se pose un dossier en main : *pendant le sinistre de février*, *entre le propriétaire et
 * l'assureur*, *qu'est-ce qui s'est dit, et quelles pièces ont circulé ?*
 *
 * 🔴 AUCUNE I/O, AUCUN `pg`, AUCUN REACT, ET C'EST SA GARANTIE. Ce fichier est atteint par le navigateur (il est
 * importé par un composant `'use client'`) : un seul import qui tirerait `pg` ferait tomber TOUTE l'application,
 * écran de connexion compris — incident du 24/09/2026, surveillé par `clientBoundary.guard.test.ts`.
 *
 * 🔴 LES DÉCISIONS NE SONT ÉCRITES QU'ICI. L'écran (`HistoriqueDuBien.tsx`) place et peint ; il ne décide ni d'une
 * période, ni d'un groupe, ni d'un mot. C'est ce qui permet d'éprouver le verdict « logement vacant » sans monter
 * un navigateur — et c'est exactement ce verdict-là qu'une maquette a déjà fait mentir (voir plus bas).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE SEUIL DE REPLI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 LE SEUIL DE REPLI, RÉEXPORTÉ — JAMAIS REDÉFINI ════════════════════════════════════════════════════════════
 *
 * Au-delà de ce nombre de personnes, un groupe du tableau « PARTIES » s'affiche REPLIÉ : un bien réel compte
 * jusqu'à 76 adresses (mesuré sur le lot 155 le 04/10/2026), et quatre groupes dépliés d'emblée auraient poussé
 * le fil hors de l'écran — c'est-à-dire caché ce qu'on est venu lire.
 *
 * 🔴 IL VIENT DE `partieCategorie.ts`, ET IL N'EST PAS RECOPIÉ. Il est réexporté ici pour que l'écran n'ait qu'un
 * module à lire ; la valeur, elle, n'a qu'un seul endroit où elle vit.
 */
export { SEUIL_REPLI_CARTES, replierLesCartes };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES RÉGLAGES — CE QUE LE TABLEAU DE BORD TIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — LES QUATRE CHOIX DE PÉRIODE, EXCLUSIFS PAR CONSTRUCTION ════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026), mot pour mot : « Choix exclusifs en boutons segmentés : “Tous les échanges” ·
 * “Depuis l'entrée du dernier locataire” · “Un événement” · “Dates personnalisées”. »
 *
 * 🔴 UNE UNION DISCRIMINÉE, ET PAS QUATRE BOOLÉENS. Il n'existe AUCUN état où deux choix seraient allumés, et le
 * compilateur refuse d'en oublier un. Quatre drapeaux côte à côte auraient permis l'état absurde — et c'est
 * toujours celui-là qui finit à l'écran, un jour, sans qu'aucun test ne l'ait prévu.
 *
 * ⚠️ `occupation` ET `evenement` PORTENT LEURS BORNES, parce que le choix **propose** une période, il ne l'impose
 * pas : les deux dates restent modifiables juste après (demande d'Arno au lot précédent, reprise telle quelle).
 * `evenement` garde en plus l'identifiant, pour que l'écran sache lequel est allumé dans la liste déroulante.
 */
export type ChoixPeriode =
  | { sorte: 'tous' }
  | { sorte: 'dates'; du: string | null; au: string | null }
  | { sorte: 'occupation'; du: string | null; au: string | null }
  | { sorte: 'evenement'; evenementId: number; du: string | null; au: string | null };

/** Les bornes d'une période, telles que le tableau de bord et la route les emploient. */
export interface BornesPeriode { du: string | null; au: string | null }

/**
 * Les bornes du choix en cours, quel qu'il soit. « Tous les échanges » n'en a aucune. PUR.
 *
 * 🔴 ÉCRITE UNE FOIS, LUE PAR `reglagesEnFiltres` ET PAR `motPeriodeEffective` : la phrase affichée à droite du
 * bloc et les bornes envoyées au serveur doivent dire LA MÊME CHOSE. Deux lectures séparées auraient pu
 * divergEr — on aurait lu « du 01/05/2025 au 04/10/2026 » sur un fil filtré autrement, et rien ne l'aurait dit.
 */
export function bornesDuChoix(p: ChoixPeriode): BornesPeriode {
  return p.sorte === 'tous' ? { du: null, au: null } : { du: p.du, au: p.au };
}

/** L'ordre du fil. Le plus récent en haut par défaut : c'est le dernier état du dossier qu'on vient chercher. */
export type OrdreFil = OrdrePieces;
export const ORDRE_FIL_DEFAUT: OrdreFil = 'recent';

export interface Reglages {
  periode: ChoixPeriode;
  /**
   * Les adresses COCHÉES, en forme canonique (minuscules). Vide + `toutesLesParties` éteint = aucune personne
   * choisie : l'écran le DIT et ne filtre rien, plutôt que de rendre un fil vide qui se lirait « rien ne s'est dit ».
   */
  parties: string[];
  /**
   * 🔴 « TOUS LES MAILS DU BIEN PENDANT LA PÉRIODE » — IGNORE LE CHOIX DES PARTIES, sans l'effacer. Demande
   * d'Arno : l'interrupteur se relève et l'on retrouve ses cases telles qu'on les avait laissées. Vider `parties`
   * à l'allumage aurait obligé à tout recocher pour comparer les deux lectures.
   */
  toutesLesParties: boolean;
  pieces: ChoixPieces;
  ordre: OrdreFil;
  /**
   * « Regrouper par conversation ». DÉCOCHÉ par défaut : le fil est chronologique, c'est sa raison d'être.
   *
   * ⚠️ CE N'EST **PAS** LE `grouper=1` DE LA ROUTE, ET LES CONFONDRE AURAIT ÉTÉ UN DÉFAUT SILENCIEUX. Le
   * paramètre de la route regroupe par **CIBLE** — il sert à l'historique d'un PROPRIÉTAIRE, pour séparer ses
   * logements. Sur une cible `lot-…` il n'y a qu'une cible : le paramètre n'aurait rien regroupé, et il aurait en
   * plus fait passer la requête d'un `DISTINCT ON (message_id)` à un `DISTINCT` (un mail qui entre par deux axes
   * compterait deux fois). Ce réglage-ci regroupe par ÉCHANGE (`filId`), à l'écran, sur la page reçue — voir
   * `grouperParConversation`.
   */
  grouper: boolean;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — REPRIS DE « VIE DU BIEN », QUI EST SUPPRIMÉ ══════════════════════════════════
   *
   * ACCORD EXPLICITE D'ARNO (04/10/2026) : « le bloc “Vie du bien” est SUPPRIMÉ (deux listings de mails, c'est un
   * de trop). Le moteur de recherche prend SA PLACE. » Et : « Tout ce que faisait “Vie du bien” est repris dans le
   * moteur, **rien n'est perdu** : recherche dans l'objet et le texte, filtre “Avec pièces jointes”, filtre “Avec
   * événement ouvert”, dépliage d'un mail par le triangle ▸, sélection d'un mail. »
   *
   * 🔴 CES DEUX RÉGLAGES SONT LA PART QUI MANQUAIT. Le moteur savait déjà filtrer les pièces, déplier et
   * sélectionner ; il ne savait ni chercher, ni isoler les échanges qui portent un événement ouvert. Les ajouter
   * ICI plutôt que dans l'écran est ce qui rend la reprise ÉPROUVABLE sans navigateur : `reglagesEnFiltres` doit
   * produire `q=` et `evt=ouvert`, et c'est un test qui le dit.
   *
   * ⚠️ LA ROUTE LES CONNAÎT DÉJÀ, ET RIEN N'EST DONC INVENTÉ : `FiltresHistorique` porte `texte` et
   * `evenementOuvert` depuis l'origine, et « Vie du bien » les écrivait à la main (`p.set('q', …)`,
   * `p.set('evt', 'ouvert')`). On passe d'une écriture à la main à la sérialisation commune — une grammaire
   * d'adresse de moins à tenir.
   */
  texte: string;
  evenementOuvert: boolean;
}

/** L'état de départ : tout le bien, toutes les parties, toutes les pièces, le plus récent en haut, non regroupé. */
export const REGLAGES_DEFAUT: Reglages = {
  periode: { sorte: 'tous' },
  parties: [],
  toutesLesParties: true,
  pieces: 'toutes',
  ordre: ORDRE_FIL_DEFAUT,
  grouper: false,
  texte: '',
  evenementOuvert: false,
};

/**
 * Un réglage est-il actif ? Sert à n'offrir « tout remettre à plat » que quand il y a quelque chose à défaire. PUR.
 *
 * ⚠️ LA RECHERCHE ET LE FILTRE D'ÉVÉNEMENT EN FONT PARTIE (lot HISTORIQUE-BIEN-2) : sans eux, taper trois lettres
 * puis ne rien trouver n'aurait offert aucun moyen de revenir en arrière — et le fil vide aurait accusé le bien.
 */
export function reglagesActifs(r: Reglages): boolean {
  return r.periode.sorte !== 'tous' || !r.toutesLesParties || r.pieces !== 'toutes'
    || r.ordre !== ORDRE_FIL_DEFAUT || r.grouper
    || r.texte.trim() !== '' || r.evenementOuvert;
}

/** L'inversion de l'ordre, écrite une fois. PUR. */
export function ordreFilSuivant(o: OrdreFil): OrdreFil {
  return o === 'recent' ? 'ancien' : 'recent';
}

/**
 * LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait. PUR.
 *
 * ⚠️ MÊME CONVENTION QUE `libelleOrdrePieces` ET QUE L'ORDRE DE LECTURE DES MESSAGES, et c'est pour cela qu'elle
 * est recopiée en mots et non en appel : le sujet n'est pas le même (« plus récent » parle d'un MAIL, pas d'une
 * pièce), mais la règle de lecture doit l'être. Deux conventions opposées dans le même écran seraient pires que
 * l'une ou l'autre.
 */
export function libelleOrdreFil(o: OrdreFil): string {
  return o === 'recent' ? 'Plus récent en haut' : 'Plus ancien en haut';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA PÉRIODE D'UN ÉVÉNEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le jour civil, à PARIS. Les bornes d'un filtre se lisent comme une personne les lit, pas en UTC. PUR. */
export function jourParis(d: Date): string {
  /* ⚠️ `en-CA` REND DÉJÀ `AAAA-MM-JJ` : c'est la seule locale courante qui le fasse, et cela évite de recoller
     trois morceaux à la main — recollage où l'on oublie toujours le zéro du mois. */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Un événement, tel que la période se lit dessus. `closLe === null` ⇒ il n'est pas clos. */
export interface EvenementBorne {
  ouvertLe: string | null;
  closLe: string | null;
}

/**
 * ══ 🔴🔴 LA PÉRIODE D'UN ÉVÉNEMENT : DE SON OUVERTURE À SA CLÔTURE, OU JUSQU'À MAINTENANT. PUR. ══════════════════
 *
 * DEMANDE D'ARNO : choisir un événement RÈGLE les deux dates. Un événement clos borne les deux côtés ; un
 * événement en cours borne le début et court jusqu'à aujourd'hui.
 *
 * 🔴 ELLE **PROPOSE**, ELLE N'IMPOSE PAS. Les deux dates restent modifiables à la main juste après : c'est la
 * demande d'Arno, mot pour mot, et c'est aussi ce qui évite le piège de l'événement dont la date d'ouverture est
 * postérieure au premier mail (un sinistre déclaré huit jours après le dégât). Une période verrouillée aurait
 * caché ces huit jours sans jamais dire qu'elle les cachait.
 *
 * ⚠️ UNE OUVERTURE INCONNUE RESTE `null`, ELLE NE DEVIENT PAS « AUJOURD'HUI ». Une borne basse inventée vaut une
 * période fausse ; `null` se lit « pas de borne de ce côté », et le fil montre tout ce qui précède.
 *
 * ⚠️ UNE DATE ABÎMÉE EST ÉCARTÉE, PAS DEVINÉE (`jourValide`) : « 03/07/2024 » n'est pas une date ISO, et la
 * tolérance qui la lirait quand même finirait par lire « 03/07 » comme le 7 mars.
 */
export function periodeDeLEvenement(
  e: EvenementBorne, maintenant: Date,
): { du: string | null; au: string | null } {
  const du = jourValide((e.ouvertLe ?? '').slice(0, 10));
  const clos = jourValide((e.closLe ?? '').slice(0, 10));
  return { du, au: clos ?? jourParis(maintenant) };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES PARTIES, EN TROIS GROUPES — PLUS « À RÉPARTIR »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES TROIS CATÉGORIES DE PARTIE — DÉRIVÉES DE `partieCategorie.ts`, PAS RECOPIÉES.
 *
 * 🔴 `Exclude<Categorie, 'a_repartir'>` ET NON UNE LISTE ÉCRITE À LA MAIN : le jour où une quatrième catégorie
 * naît là-bas, le compilateur l'amène ici (et signale le titre manquant dans `TITRES_GROUPES`). Une liste
 * recopiée se serait contentée de l'ignorer en silence, et la nouvelle catégorie serait tombée « à répartir ».
 */
export type CategoriePartie = Exclude<Categorie, 'a_repartir'>;

/**
 * Les quatre groupes du tableau « PARTIES », toujours dans cet ordre.
 *
 * ⚠️ `a_repartir` EST UNE VALEUR DE `Categorie` LÀ-BAS, et c'est exact : « à répartir » est l'état d'une adresse
 * qu'on n'a pas encore rangée, pas l'absence d'information. Ici il nomme donc le quatrième groupe.
 */
export type CleGroupeParties = Categorie;

export interface GroupeParties {
  cle: CleGroupeParties;
  titre: string;
  /** Le ton du groupe, le MÊME que celui de la barre des mails qui en viennent. */
  ton: TonGroupe;
  interlocuteurs: Interlocuteur[];
  /** Combien de personnes dans ce groupe. Lisible SANS déplier — c'est tout l'intérêt du repli. */
  nb: number;
}

/** Ce que `grouperParCategorie` rend : les quatre groupes, et ce qui en a été écarté. */
export interface PartiesRangees {
  groupes: GroupeParties[];
  /**
   * 🔴🔴 LES ADRESSES DE NOTRE AGENCE, MISES À PART — ET COMPTÉES POUR QU'ON PUISSE LE DIRE.
   *
   * DEMANDE D'ARNO (04/10/2026) : « Notre agence n'est pas un groupe sélectionnable : ses mails apparaissent dès
   * qu'ils font partie d'un échange avec une partie sélectionnée. »
   *
   * ⚠️ ÉCARTÉES, PAS CACHÉES. Le nombre est rendu pour que l'écran l'écrive : « N adresses de notre agence ne
   * sont pas listées ». Les faire disparaître sans un mot aurait laissé croire que le bien compte moins
   * d'interlocuteurs qu'il n'en a — et, sur un bien où nous écrivons beaucoup, le compte des groupes aurait
   * semblé faux sans qu'on sache pourquoi.
   */
  nousEcartees: number;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — LE VOCABULAIRE D'ARNO, ET IL REMPLACE L'ANCIEN PARTOUT ══════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « “Tiers indépendant” REMPLACE le libellé “Indépendant” partout (même catégorie,
 * mêmes règles : jamais d'automatisation). » Et pour le quatrième groupe : « Non affectés (gris) ».
 *
 * 🔴 LES CLÉS NE CHANGENT PAS, ET IL NE FAUT SURTOUT PAS QU'ELLES CHANGENT. `independant` et `a_repartir` sont
 * écrites EN BASE (`gestion_partie_categorie`, migration 304, 640 lignes posées) et dans la contrainte CHECK de
 * la table. Renommer la clé aurait demandé une migration de données pour un mot d'écran — et un `CHECK` à
 * refaire. Seul le LIBELLÉ change, et il n'a toujours qu'un seul endroit où il vit.
 *
 * ⚠️ « MÊME CATÉGORIE, MÊMES RÈGLES » : `sertALAutomatisation` continue de refuser `independant`, et le garde qui
 * l'éprouve n'a pas bougé d'une ligne. Un nouveau mot ne crée pas une nouvelle règle.
 */
const TITRES_GROUPES: Record<CleGroupeParties, string> = {
  proprietaire: 'Propriétaire',
  locataire: 'Locataire',
  independant: 'Tiers indépendant',
  /**
   * 🔴 « NON AFFECTÉS » EST LE QUATRIÈME GROUPE, ET IL N'EST PAS UN FOURRE-TOUT HONTEUX. C'est là que tombent les
   * assureurs, les syndics, les artisans, les voisins — tout ce que l'annuaire ne rattache ni au propriétaire ni
   * au locataire. Les fondre dans un des trois autres aurait écrit noir sur blanc une appartenance fausse ; les
   * cacher aurait rendu leurs mails introuvables. On les NOMME, et le nom dit qu'il reste un geste à faire —
   * c'est d'ailleurs sur eux, et sur eux seuls, que le bouton « + » de création de contact apparaît.
   */
  a_repartir: 'Non affectés',
};

/**
 * ══ 🔴🔴 LA COULEUR DE CHAQUE GROUPE, NOMMÉE UNE FOIS ════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Propriétaire (rouge) · Locataire (vert) · Tiers indépendant (bleu) · Non affectés (gris) ».
 * Ce sont les mêmes quatre tons que la barre verticale du listing, et c'est tout l'intérêt : la case cochée et
 * la barre du mail qui en vient portent la MÊME couleur, sans qu'on ait à l'apprendre.
 *
 * 🔴 UN NOM DE TON, PAS UNE COULEUR. La valeur réelle vit dans `globals.css` sous un jeton `--color-svv-…`, et
 * l'écran ne fait que composer une classe. Écrire un `#rrggbb` ici aurait créé une couleur hors du thème, donc
 * illisible dans l'un des deux modes — ce que le dépôt interdit et vérifie.
 */
export type TonGroupe = 'rouge' | 'vert' | 'bleu' | 'gris';

const TONS_GROUPES: Record<CleGroupeParties, TonGroupe> = {
  proprietaire: 'rouge',
  locataire: 'vert',
  independant: 'bleu',
  a_repartir: 'gris',
};

/** Le ton d'un groupe. PUR. */
export function tonDuGroupe(cle: CleGroupeParties): TonGroupe {
  return TONS_GROUPES[cle];
}

/**
 * ══ 🔴🔴 LES INTERLOCUTEURS, EN QUATRE GROUPES. PUR. ═════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « PARTIES en trois groupes repliables […] plus “À répartir”, chaque adresse portant ses deux
 * compteurs. Jamais une seule liste interminable. »
 *
 * 🔴 POURQUOI PAS UNE LISTE. Mesuré le 04/10/2026 : le lot 155 porte 76 adresses distinctes. Une liste de 76
 * cases à cocher, ordonnée par nombre de mails, oblige à lire les 76 pour trouver « l'assureur » — et le
 * propriétaire du bien peut s'y trouver en 41e position parce qu'il écrit peu.
 *
 * ⚠️ LES QUATRE GROUPES SONT **TOUJOURS RENDUS**, même vides, et dans le même ordre. Un groupe qui apparaît et
 * disparaît selon le bien déplace les cases d'un clic à l'autre : on coche alors « Locataire » en croyant cocher
 * « Propriétaire ». C'est l'écran qui décide de ne pas PEINDRE un groupe vide ; la liste, elle, ne bouge pas.
 *
 * ⚠️ L'ORDRE À L'INTÉRIEUR D'UN GROUPE EST CELUI REÇU, jamais retrié ici : la route rend déjà les interlocuteurs
 * du plus bavard au moins bavard, et un second tri aurait donné deux vérités sur « qui parle le plus ».
 */
export function grouperParCategorie(
  interlocuteurs: readonly Interlocuteur[],
  categories: ReadonlyMap<string, CategoriePartie>,
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — LES CLIENTS DU BIEN, ÉPARGNÉS PAR L'ÉCART DE L'AGENCE ═════════════
   *
   * DÉCISION D'ARNO : un propriétaire client dont l'adresse est une des nôtres garde sa capsule. Sans cet
   * ensemble, la règle du lot 2 (« notre agence n'est pas une partie ») l'écartait avec les autres — c'est tout
   * le diagnostic du lot 5, et c'est ce qu'Arno vient de trancher.
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LETTRE : toute adresse interne est écartée et comptée.
   * Les quatre autres appelants de cette fonction n'ont rien à changer.
   *
   * ⚠️ IL NE REND PAS LA CAPSULE SÉLECTIONNABLE POUR AUTANT — cela se décide à l'écran (`adresseACorriger`), et
   * c'est voulu : la liste et le filtre sont deux questions, et les confondre ferait cocher « nous » en croyant
   * cocher « le propriétaire ».
   */
  clientsDuBien: ReadonlySet<string> = new Set(),
): PartiesRangees {
  const ordre: CleGroupeParties[] = ['proprietaire', 'locataire', 'independant', 'a_repartir'];
  const groupes = new Map<CleGroupeParties, Interlocuteur[]>(ordre.map((c) => [c, []]));
  let nousEcartees = 0;
  for (const i of interlocuteurs) {
    /**
     * ══ 🔴🔴 NOTRE AGENCE N'EST PAS UN GROUPE SÉLECTIONNABLE (lot HISTORIQUE-BIEN-2) ═══════════════════════════
     *
     * Demande d'Arno, mot pour mot. Elle n'est pas une PARTIE : elle est celle qui tient le dossier. Lui donner
     * une case à cocher aurait proposé un filtre qui n'a pas de sens — « les mails où nous sommes », c'est-à-dire
     * presque tous — et l'aurait mise sur le même plan qu'un propriétaire ou qu'un locataire.
     *
     * ⚠️ SES MAILS NE DISPARAISSENT PAS POUR AUTANT : ils entrent dès que l'ÉCHANGE porte une partie cochée,
     * puisque nous y sommes expéditeur ou destinataire. Cocher « le locataire » ramène donc bien ce qu'on lui a
     * écrit, et pas seulement ce qu'il a écrit.
     *
     * ⚠️ `interne` VIENT DU DÉPÔT, pas d'une liste de domaines recopiée ici : `interlocuteursDuBien` le rend avec
     * chaque adresse. Une seconde règle « qui est des nôtres ? » aurait divergé de la première au premier
     * collègue qui change d'adresse.
     */
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — SAUF SI C'EST UN CLIENT DU BIEN. Décision d'Arno : sa capsule reste,
     * et c'est l'écran qui l'empêche de cocher. Elle n'est alors pas comptée dans « N adresses de notre agence ne
     * sont pas listées » — elle EST listée, et le dire serait faux.
     */
    if (i.interne && !clientsDuBien.has(i.adresse.trim().toLowerCase())) { nousEcartees += 1; continue; }
    /* ⚠️ LA CLÉ EST NORMALISÉE DES DEUX CÔTÉS : « Jean.PONS@… » et « jean.pons@… » sont la même personne, et une
       comparaison sensible à la casse l'aurait rangée « non affectée » alors que l'annuaire la connaît. */
    const cle = categories.get(i.adresse.trim().toLowerCase()) ?? 'a_repartir';
    groupes.get(cle)?.push(i);
  }
  return {
    groupes: ordre.map((cle) => {
      const liste = groupes.get(cle) ?? [];
      return {
        cle, titre: TITRES_GROUPES[cle], ton: TONS_GROUPES[cle], interlocuteurs: liste, nb: liste.length,
      };
    }),
    nousEcartees,
  };
}

/**
 * ══ 🔴 « N ADRESSES DE NOTRE AGENCE NE SONT PAS LISTÉES » ════════════════════════════════════════════════════════
 *
 * La phrase dit ce qui a été écarté ET pourquoi ce n'est pas une perte. `null` quand il n'y a rien à dire : une
 * note permanente sur un bien où nous n'avons jamais écrit serait du bruit.
 */
export function motAgenceEcartee(nousEcartees: number): string | null {
  if (nousEcartees <= 0) return null;
  const n = nousEcartees === 1
    ? 'Une adresse de notre agence n’est pas listée'
    : `${nousEcartees} adresses de notre agence ne sont pas listées`;
  return `${n} : nos mails apparaissent dès qu’ils font partie d’un échange avec une partie sélectionnée.`;
}

/**
 * ══ 🔴🔴 LA PÉRIODE D'UNE PARTIE — « CHACUN AVEC SA PÉRIODE » ════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « Locataire (vert ; locataire en place et anciens locataires, chacun avec sa
 * période) ».
 *
 * 🔴 ELLE PORTE SON MOT **ET** SES DEUX BORNES, et les deux servent : le mot s'affiche sous le nom (« du
 * 01/01/2020 au 30/06/2024 »), les bornes règlent le tableau de bord quand on clique dessus. C'est ainsi que le
 * geste du lot précédent — choisir la période d'un ancien locataire — se retrouve à l'endroit où Arno place
 * désormais cette information, au lieu d'être perdu avec la rangée de boutons qu'il a demandé de retirer.
 *
 * ⚠️ LE MOT EST ÉCRIT PAR `periodeOccupation`, la fonction que les trois fiches emploient déjà — « du … au … »,
 * « depuis le … » ou « dates inconnues ». Jamais une date devinée, jamais une seconde mise en forme.
 */
export interface PeriodePartie {
  mot: string;
  du: string | null;
  au: string | null;
}

/**
 * LES DEUX COMPTEURS D'UNE PERSONNE, dans les mots d'Arno : « a écrit : 3 · en copie : 2 ». PUR.
 *
 * ⚠️ LES DEUX SONT TOUJOURS ÉCRITS, MÊME À ZÉRO. « a écrit : 0 · en copie : 23 » est une information précieuse —
 * c'est le voisin qu'on met en copie et qui n'a jamais répondu. N'afficher que les compteurs non nuls aurait
 * laissé croire à une donnée manquante.
 */
export function motDeuxCompteurs(i: { aEcrit: number; enCopie: number }): string {
  return `a écrit : ${i.aEcrit} · en copie : ${i.enCopie}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④-bis 🔴🔴 LOT HISTORIQUE-BIEN-2 — LA BARRE DE COULEUR D'UN MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 DE QUELLE COULEUR EST LA BARRE D'UN MAIL ? PUR. ═════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026), mot pour mot : « Une petite BARRE VERTICALE de couleur, à DROITE de chaque mail,
 * selon la catégorie de l'expéditeur : ROUGE = propriétaire ou contact du propriétaire ; VERT = locataire ou
 * contact du locataire ; BLEU = tiers indépendant ; AUCUNE couleur = nous (agence) ; gris pointillé = non
 * affecté. »
 *
 * 🔴 « NOUS » SE LIT SUR LE SENS DU MAIL, ET NON SUR UNE LISTE D'ADRESSES INTERNES. `sens === 'envoye'` veut dire
 * « nous avons écrit » — c'est déjà le mot que la ligne affiche (`libelleSens`), et c'est la même vérité. Croiser
 * l'expéditeur avec une liste de nos adresses aurait été un second juge pour « qui est des nôtres ? », qui aurait
 * divergé du premier au premier collègue changeant d'adresse. Et il aurait raté le cas d'un mail que nous avons
 * envoyé depuis une adresse que l'annuaire des interlocuteurs ne liste pas sur CE bien.
 *
 * 🔴 « CONTACT DU PROPRIÉTAIRE » PORTE LA MÊME COULEUR QUE LE PROPRIÉTAIRE, et ce n'est pas un raccourci : la
 * carte des catégories range précisément ainsi — un contact rangé côté propriétaire a la catégorie
 * `proprietaire`. La couleur suit donc la catégorie RETENUE, sans distinction client/contact, exactement comme
 * les quatre groupes du bloc PARTIES. Une cinquième couleur pour les contacts aurait demandé de les distinguer
 * à l'œil, ce qu'Arno n'a pas demandé — et aurait doublé la légende.
 *
 * ⚠️ UNE ADRESSE INCONNUE DONNE « gris », PAS « nous ». C'est le cas le plus fréquent au départ (90 adresses non
 * affectées sur la base), et le gris POINTILLÉ dit exactement ce qu'il est : il reste un geste à faire. Le
 * confondre avec « aucune couleur » aurait fait passer un tiers inconnu pour un collègue.
 */
export type TonMail = TonGroupe | 'nous';

export function tonDeLExpediteur(
  l: Pick<LigneHistorique, 'sens' | 'de'>,
  categories: ReadonlyMap<string, CategoriePartie>,
): TonMail {
  if (l.sens === 'envoye') return 'nous';
  const c = categories.get((l.de ?? '').trim().toLowerCase());
  return c === undefined ? 'gris' : TONS_GROUPES[c];
}

/**
 * ══ 🔴 LA LÉGENDE, ÉCRITE UNE FOIS ══════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « avec une légende discrète au-dessus du listing ». Une couleur sans légende n'est pas une information :
 * elle se devine, et on se trompe. Les cinq entrées sont dans l'ordre des groupes, « nous » en dernier parce
 * qu'il est l'absence de couleur — le dire après les quatre autres évite de chercher une teinte qui n'existe pas.
 */
export const LEGENDE_BARRES: readonly { ton: TonMail; mot: string }[] = [
  { ton: 'rouge', mot: 'propriétaire' },
  { ton: 'vert', mot: 'locataire' },
  { ton: 'bleu', mot: 'tiers indépendant' },
  { ton: 'gris', mot: 'non affecté' },
  { ton: 'nous', mot: 'nous' },
];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④-quater 🔴🔴 LOT HISTORIQUE-BIEN-3 — QUI SE DÉPLACE, ET VERS OÙ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LES DEUX ENCARTS, ET LES DEUX BANDES ════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « “Tiers indépendant” : une ligne déployable SOUS les deux encarts, pleine
 * largeur, bleue, repliée par défaut (“Tiers indépendant · 4 ▸”), qui reste une zone de dépôt même repliée […]
 * Même chose pour “Non affectés” (grise). »
 *
 * 🔴 LA RÉPARTITION EST ÉCRITE ICI, UNE FOIS. L'écran lit ces deux listes et ne décide pas lui-même qui est un
 * encart : une seconde liste côté écran aurait pu diverger de l'ordre des groupes, et une catégorie se serait
 * retrouvée rendue deux fois — ou pas du tout.
 */
export const GROUPES_EN_ENCART: readonly CleGroupeParties[] = ['proprietaire', 'locataire'];
export const GROUPES_EN_BANDE: readonly CleGroupeParties[] = ['independant', 'a_repartir'];

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LE CLIENT DU BIEN A SA CAPSULE, MÊME SANS UN SEUL MAIL ═════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, fiche lot-299 — le foyer COLSON FARDEAU) : « l'encart Propriétaire a disparu et
 * l'encart Locataire prend toute la largeur. »
 *
 * ═══ 🔴 LE DIAGNOSTIC, MESURÉ EN BASE AVANT D'ÊTRE CORRIGÉ ════════════════════════════════════════════════════════
 *
 * TROIS CAUSES EMPILÉES, et il fallait les trois pour produire ce que voit Arno :
 *
 *   ① **LES GROUPES SE CONSTRUISENT SUR LES MAILS, PAS SUR LA FICHE.** `grouperParCategorie` ne range que des
 *      INTERLOCUTEURS — des gens qui ont écrit ou reçu quelque chose. Un propriétaire qui n'a jamais écrit sur ce
 *      bien n'est donc nulle part. Mesuré sur lot-299 (WIPPIMMO 432) : son propriétaire est
 *      `JULLIEN - GARRIDO Cédric`, dont la seule adresse de l'annuaire est `@sansvisavis.com` —
 *      `interne = true` en base, donc **écartée exprès** par la règle « notre agence n'est pas une partie »
 *      (lot 2). Ses trois autres propriétaires liés n'ont que des adresses `@example.invalid` de test, absentes
 *      des mails. Le groupe « Propriétaire » était donc **vide**, et légitimement.
 *
 *   ② **L'ÉCRAN NE PEIGNAIT PAS UN GROUPE VIDE** (`if (g.nb === 0) return null`).
 *
 *   ③ **ET LA GRILLE LAISSAIT LE SURVIVANT PRENDRE TOUTE LA PLACE** (`repeat(auto-fit, minmax(…, 1fr))` : avec un
 *      seul enfant, `auto-fit` replie la seconde colonne et la première occupe la ligne entière).
 *
 * ═══ 🔴 CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT PAS ════════════════════════════════════════════════════
 *
 * Elle répond à ① : « Le propriétaire client (carte du haut de fiche) y apparaît en capsule même avec 0 mail,
 * avec ses compteurs à 0. » Les adresses CLIENTES de la fiche qui ne sont pas déjà des interlocuteurs sont
 * ajoutées avec `nbMails`, `aEcrit` et `enCopie` à **zéro** — un zéro qui est un FAIT (« cette personne n'a rien
 * écrit sur cette période »), pas une donnée manquante.
 *
 * ⚠️ ELLE N'ÉCRASE JAMAIS UN INTERLOCUTEUR EXISTANT. Un propriétaire qui a écrit garde ses compteurs réels ; on
 * ne complète que ce qui manque. L'inverse aurait remis à zéro les compteurs du client le plus bavard du bien.
 *
 * ⚠️ ELLE N'AJOUTE PAS LES ADRESSES INTERNES, même quand la fiche les porte comme clientes — et c'est le cas de
 * lot-299. La règle du lot 2 (« notre agence n'est pas un groupe sélectionnable ») n'est pas renversée ici : la
 * cocher proposerait « les mails où nous sommes », c'est-à-dire presque tous. L'encart « Propriétaire » de
 * lot-299 reste donc vide, et c'est maintenant l'ENCART qui le dit (`motEncartVide`) au lieu de disparaître.
 *   🔭 **Question posée à Arno** : veut-il qu'un propriétaire CLIENT dont l'adresse est une des nôtres soit
 *      malgré tout listé dans son encart ? C'est le cas de lot-299, et c'est le seul moyen de lui donner une
 *      capsule. Je ne l'ai pas fait de moi-même : cela toucherait la règle qu'il a posée au lot 2.
 *
 * ⚠️ L'ORDRE EST STABLE : les interlocuteurs reçus d'abord, dans leur ordre (le plus bavard en tête, décidé par
 * le dépôt), puis les clients ajoutés dans l'ordre de la fiche. Intercaler des zéros au milieu aurait déplacé
 * les cases d'un rendu à l'autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface ClientDuBien {
  /**
   * L'adresse e-mail du client, ou `null` quand l'annuaire n'en connaît pas.
   *
   * ⚠️ `null` N'EST PAS UNE ABSENCE DE CLIENT : c'est un client SANS adresse, et la distinction porte la phrase
   * de l'encart vide. « Aucun locataire connu » et « aucun échange avec le locataire » ne disent pas la même
   * chose, et c'est exactement la nuance qu'Arno a écrite dans ses deux exemples.
   */
  adresse: string | null;
  nom: string | null;
  /** De quel encart ce client relève. Les bandes n'ont pas de client : elles n'accueillent que des contacts. */
  categorie: 'proprietaire' | 'locataire';
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — SA FICHE D'ANNUAIRE, pour le lien « adresse à corriger ». `null` quand
   * la personne n'est pas dans l'annuaire des personnes (le bien porte alors ses coordonnées en propre) : la
   * mention s'affiche quand même, sans lien — dire le problème vaut mieux que se taire parce qu'on n'a pas de
   * porte à offrir.
   */
  fiche?: { sorte: 'proprietaire' | 'locataire'; id: number } | null;
}

export function completerAvecLesClients(
  interlocuteurs: readonly Interlocuteur[],
  clients: readonly ClientDuBien[],
): Interlocuteur[] {
  const deja = new Set(interlocuteurs.map((i) => i.adresse.trim().toLowerCase()));
  const out = [...interlocuteurs];
  for (const c of clients) {
    const a = (c.adresse ?? '').trim();
    if (a === '') continue;
    const cle = a.toLowerCase();
    if (deja.has(cle)) continue;
    deja.add(cle);
    out.push({ adresse: a, nom: c.nom, nbMails: 0, aEcrit: 0, enCopie: 0, interne: false });
  }
  return out;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — CE QUE DIT UN ENCART VIDE. PUR. ════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Un encart sans capsule reste affiché, avec un texte discret (“Aucun échange avec le
 * propriétaire sur cette période” ou “Aucun locataire connu”) et il reste une zone de dépôt. »
 *
 * 🔴 SES DEUX PHRASES NE DÉCRIVENT PAS LE MÊME CAS, et c'est pour cela qu'il y en a deux. « Aucun locataire
 * connu » parle de l'ANNUAIRE : personne n'habite ce logement, pour autant qu'on sache. « Aucun échange […] sur
 * cette période » parle des MAILS : la personne existe, elle n'a simplement rien écrit ici. Afficher la seconde
 * sur un logement vacant laisserait chercher un locataire qui n'existe pas ; afficher la première sur un bien
 * dont le locataire est connu mais muet serait faux.
 *
 * ⚠️ LES QUATRE CAS SONT DITS. Les deux qu'Arno a écrits, et leurs deux symétriques — un bien sans propriétaire
 * dans l'annuaire, et un locataire connu mais sans échange. Laisser l'un des quatre sans phrase aurait rendu un
 * encart muet, c'est-à-dire exactement le défaut qu'on répare.
 */
export function motEncartVide(cle: CleGroupeParties, clientConnu: boolean): string {
  if (cle === 'locataire') {
    return clientConnu
      ? 'Aucun échange avec le locataire sur cette période.'
      : 'Aucun locataire connu.';
  }
  return clientConnu
    ? 'Aucun échange avec le propriétaire sur cette période.'
    : 'Aucun propriétaire connu pour ce bien.';
}

/** Un client est-il NOMMÉ pour cet encart, adresse ou pas ? Décide laquelle des deux phrases s'affiche. PUR. */
export function clientConnuPour(
  cle: CleGroupeParties, clients: readonly ClientDuBien[],
): boolean {
  if (cle !== 'proprietaire' && cle !== 'locataire') return false;
  return clients.some((c) => c.categorie === cle);
}

/**
 * ══ 🔴🔴 QUI PEUT SE DÉPLACER ? PUR. ════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Les capsules des CONTACTS se glissent-déposent d'une catégorie à l'autre. Les capsules des
 * CLIENTS eux-mêmes (propriétaire(s), locataire en place, anciens locataires) et celles de l'agence ne se
 * déplacent pas : curseur “interdit” et info-bulle “Client du bien — non déplaçable”. »
 *
 * 🔴 « CLIENT » SE LIT SUR LA FICHE, ET SUR ELLE SEULE. `categoriesFiche` est la carte que la fiche du bien
 * fournit : ses propriétaires, ses occupants d'hier et d'aujourd'hui, et leurs contacts déjà connus de
 * l'annuaire. C'est la même carte qui, dans la fusion, l'emporte sur tout rangement de base — « un client n'est
 * jamais un contact » (règle d'Arno au lot 1). Déduire « client » d'autre chose aurait fait deux définitions,
 * et c'est celle qu'on relit le moins qui aurait fini par autoriser à déplacer un propriétaire.
 *
 * 🔴 ET DÉPLACER UN CLIENT N'AURAIT MÊME PAS TENU : la fusion le remettrait dans son groupe au rendu suivant,
 * puisque la fiche l'emporte. L'interdiction n'est donc pas une précaution d'ergonomie, c'est la vérité de
 * l'arbitrage — et c'est pourquoi l'info-bulle dit POURQUOI, et pas seulement « non ».
 *
 * ⚠️ L'AGENCE N'EST PAS LISTÉE DU TOUT depuis le lot 2 (`grouperParCategorie` l'écarte, et le dit) : aucune
 * capsule ne la porte, donc la règle n'a rien à refuser de ce côté. Elle est écrite quand même — le jour où
 * Arno voudrait revoir ces adresses dans les listes, l'interdiction sera déjà là.
 */
export const MOTIF_NON_DEPLACABLE = 'Client du bien — non déplaçable';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — CE QU'EST UNE CAPSULE, EN QUATRE MOTS ET UNE SEULE FONCTION ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * TROISIÈME DEMANDE D'ARNO POUR LE MÊME BOUTON (05/10/2026), et cette fois la règle est écrite sans interprétation
 * possible — je la recopie, parce que c'est elle qui est codée ici et nulle part ailleurs :
 *
 *   « Une capsule est CLIENT si son adresse appartient au propriétaire ou à un locataire (actuel ou ancien) tel
 *     qu'enregistré dans la fiche du bien ou dans l'annuaire. Une capsule est AGENCE si l'adresse est la nôtre.
 *     TOUTES LES AUTRES sont des CONTACTS : toute personne recoupée par l'automatisation parce qu'elle est en
 *     copie ou participe aux échanges sans être cliente. […] Pas de “+” sur les capsules CLIENT, AGENCE ni TIERS
 *     INDÉPENDANT. »
 *
 * ═══ 🔴 POURQUOI LE « + » NE S'AFFICHAIT PAS, ET CE QUE LA MESURE DIT ════════════════════════════════════════════
 *
 * La règle du lot 3 n'était pas fausse — elle était INCOMPLÈTE, de deux façons, et les deux se voient sur lot-299 :
 *
 *   ① **UNE CARTE QUI EXISTE FAISAIT DISPARAÎTRE LE BOUTON, SANS RIEN METTRE À LA PLACE.** La condition était
 *      « pas de carte de ce côté ⇒ “+” », et rien n'était prévu pour « carte présente ». MESURÉ : sur lot-299,
 *      `estebanfrdpro@gmail.com` porte la carte 1462 (`cote = locataire`, vérifiée, `retire_le` nul). La capsule
 *      n'avait donc que son « … » — exactement ce qu'Arno décrit. Le lot 3 disait « le “+” disparaît dès que la
 *      carte existe » ; le lot 6 dit ce qui le remplace : **une icône de fiche**, grise, ou **orange** quand la
 *      carte est encore « à vérifier ».
 *
 *   ② **« NON AFFECTÉS » N'AVAIT PAS DE « + » DU TOUT.** La condition `coteDeLaCategorie(g.cle) !== null` écarte
 *      `independant` ET `a_repartir` d'un même geste, parce que ni l'un ni l'autre ne donne un côté. Or Arno veut
 *      le bouton sur les contacts de « Non affectés » aussi — avec, là, un choix de côté OBLIGATOIRE, puisque
 *      l'écran n'a rien à pré-remplir. MESURÉ sur lot-299 : `puroflowparis@gmail.com` (2 mails) était dans ce cas.
 *
 * ═══ 🔴 CE QUE CETTE FONCTION REMPLACE, ET POURQUOI ELLE EST UNE SEULE ═══════════════════════════════════════════
 *
 * `partieDeplacable` répondait déjà à « client ou agence ? », mais en rendant un BOOLÉEN : impossible de savoir
 * LEQUEL des deux, ni de distinguer un tiers indépendant d'un contact ordinaire. Trois conditions dispersées dans
 * le rendu faisaient le reste. Une capsule a maintenant UNE sorte, nommée, et tout ce que l'écran décide — le
 * « + », le glisser, l'info-bulle — en découle. Deux définitions de « client » auraient fini par diverger, et le
 * « + » serait apparu sur un propriétaire.
 *
 * ⚠️ L'ORDRE DES QUESTIONS EST LA RÈGLE, ET IL N'EST PAS LIBRE. « Agence » d'abord : une de nos adresses qui
 * serait AUSSI cliente (cas de lot-299, cf. `motAdresseACorriger`) reste l'agence pour le filtrage. Puis
 * « client », qui l'emporte sur tout rangement de base — « un client n'est jamais un contact » (règle d'Arno au
 * lot 1). Puis « tiers indépendant », qui est un rangement DÉLIBÉRÉ et qu'on ne transforme pas en contact.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export type SorteDeCapsule = 'client' | 'agence' | 'tiers' | 'contact';

export function sorteDeCapsule(
  adresse: string,
  groupe: CleGroupeParties,
  categoriesFiche: ReadonlyMap<string, CategoriePartie>,
  interne: boolean,
): SorteDeCapsule {
  if (interne) return 'agence';
  if (categoriesFiche.has(adresse.trim().toLowerCase())) return 'client';
  if (groupe === 'independant') return 'tiers';
  return 'contact';
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — CE QUE PORTE LA DROITE D'UNE CAPSULE. PUR. ═════════════════════════════
 *
 * Trois états, et un seul peut être vrai à la fois :
 *   · `'plus'`     — un CONTACT sans carte de ce côté : le « + » rouge cerclé, **toujours visible**.
 *   · `'fiche'`    — sa carte existe et elle est vérifiée : la même pastille, en gris, qui ouvre la carte.
 *   · `'a_verifier'` — sa carte existe mais personne ne l'a vérifiée : la même pastille, en ORANGE. C'est le ton
 *     de la trame des cartes nées d'une passe, dans tout le module : une carte « à vérifier » se signale toujours
 *     en orange, et la pastille ne fait que reprendre ce code.
 *   · `null`       — rien à droite : client, agence, ou tiers indépendant.
 *
 * 🔴 `cotes` EST L'ENSEMBLE DES CÔTÉS OÙ UNE CARTE EXISTE POUR CETTE ADRESSE SUR CE BIEN, chacun avec son état de
 * vérification. Le côté compte, pas seulement l'adresse : la clé de la table est (bien, côté, adresse), et une
 * carte côté propriétaire ne dispense pas d'en avoir une côté locataire.
 *
 * ⚠️ DEPUIS « NON AFFECTÉS », UNE CARTE DE N'IMPORTE QUEL CÔTÉ COMPTE. La capsule n'a pas de côté à elle ; si une
 * carte existe quelque part pour cette personne sur ce bien, proposer d'en créer une seconde serait proposer un
 * doublon. On montre donc la fiche, et c'est elle qui dit de quel côté elle est.
 *
 * ⚠️ « À VÉRIFIER » L'EMPORTE SUR « VÉRIFIÉE » quand il y en a des deux : c'est le geste qui reste à faire qui doit
 * se voir, pas celui qui est fait.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 2 — DEUX ÉTATS, PLUS TROIS ═══════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO (05/10/2026) : « Toute capsule CONTACT sans carte créée (Y COMPRIS AVEC UN PRÉ-REMPLISSAGE) porte
 * le “+” rouge dans un cercle rouge […] L'icône “fiche” ORANGE DISPARAÎT. Quand la carte est créée : petite
 * icône “fiche” grise cerclée, qui ouvre la carte. »
 *
 * 🔴 L'ORANGE DISPARAÎT PARCE QU'IL N'A PLUS D'OBJET. Au lot 6, il disait « une carte existe, mais personne ne
 * l'a vérifiée » — et ces cartes-là étaient les 481 pré-remplissages. Depuis le point 1, un pré-remplissage
 * n'est plus une carte du carrousel : il n'y a donc plus d'état intermédiaire à montrer. Ou la carte est créée
 * (on l'ouvre), ou elle ne l'est pas (on la crée). Deux états, deux pastilles.
 *
 * ⚠️ `cartes` EST DEVENU UN ENSEMBLE DE CÔTÉS, et non plus une carte côté → vérifiée : le drapeau de
 * vérification n'a plus personne à renseigner. Le garder « au cas où » aurait laissé un champ mort que le
 * prochain lot aurait cru signifiant.
 */
export type PastilleDeCapsule = 'plus' | 'fiche' | null;

export function pastilleDeCapsule(
  sorte: SorteDeCapsule,
  groupe: CleGroupeParties,
  /** Les côtés où une carte **CRÉÉE** existe pour cette adresse sur ce bien. */
  cotesAvecCarte: ReadonlySet<string>,
): PastilleDeCapsule {
  if (sorte !== 'contact') return null;
  const cote = coteDeLaCategorie(groupe);
  /**
   * ⚠️ DEPUIS UN ENCART, SA CARTE SEULE COMPTE ; DEPUIS « NON AFFECTÉS », N'IMPORTE LAQUELLE. La capsule n'y a
   * pas de côté à elle ; si une carte existe quelque part pour cette personne sur ce bien, proposer d'en créer
   * une seconde serait proposer un doublon.
   */
  const aUneCarte = cote === null ? cotesAvecCarte.size > 0 : cotesAvecCarte.has(cote);
  return aUneCarte ? 'fiche' : 'plus';
}

/** Les mots de la pastille, écrits une fois — info-bulle et intitulé pour le lecteur d'écran. PUR. */
export function motPastille(p: PastilleDeCapsule, nom: string): { titre: string; aria: string } | null {
  if (p === null) return null;
  if (p === 'plus') {
    return { titre: 'Créer sa carte de contact', aria: `Créer la carte de contact de ${nom}` };
  }
  return { titre: 'Ouvrir sa carte de contact', aria: `Ouvrir la carte de contact de ${nom}` };
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — POURQUOI CE BOUTON EXISTE, ÉCRIT DANS LE CODE ═════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot : « But (à rappeler dans le code) : ce contact, désormais rattaché à une partie du
 * bien, permet ensuite de rattacher automatiquement ses nouveaux mails au bien. »
 *
 * C'est la raison d'être du geste, et elle n'est pas cosmétique : créer la carte de `secretariat.rosky@secri.fr`
 * côté propriétaire du lot 29, c'est dire « quand cette adresse écrit, c'est de ce logement qu'il s'agit ». La
 * passe de rattachement automatique le lit (cas (f) de `proposerBiens`, branché au lot 6) et propose le bien.
 *
 * ⚠️ LES TIERS INDÉPENDANTS EN SONT EXCLUS, ET C'EST LA RÈGLE D'ARNO DEPUIS LE LOT 1 : un indépendant travaille
 * sur quarante biens, et son adresse ne désigne donc aucun. La table des cartes ne peut d'ailleurs pas en porter —
 * sa colonne `cote` est contrainte à `proprietaire | locataire`.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UN CLIENT DONT L'ADRESSE N'EN EST PAS UNE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026), en réponse à ma question du lot 5 : « le propriétaire client (JULLIEN-GARRIDO
 * Cédric) apparaît en capsule dans l'encart Propriétaire même si son adresse d'annuaire est @sansvisavis.com.
 * Capsule non sélectionnable pour les mails, avec la mention discrète “adresse à corriger dans l'annuaire” (lien
 * vers sa fiche). Applique la même règle à tout client dont l'adresse est interne ou en @example.invalid. La
 * règle du lot 2 (l'agence n'est pas un groupe sélectionnable) est inchangée. »
 *
 * 🔴 LES DEUX FAMILLES D'ADRESSES IMPOSSIBLES, ET CE QU'ELLES ONT EN COMMUN. Une adresse INTERNE désigne notre
 * agence : cocher « le propriétaire » reviendrait à cocher « nous », c'est-à-dire presque tous les mails du bien.
 * Une adresse en `@example.invalid` ne désigne personne : le domaine `.invalid` est réservé par la RFC 2606
 * précisément pour qu'aucun courrier n'y parvienne jamais. Dans les deux cas, la capsule ne peut pas FILTRER —
 * mais elle peut, et doit, DIRE que le dossier a une adresse à corriger. Mesuré sur lot-299 : son propriétaire
 * n'a que `c.jullien@sansvisavis.com`, et ses trois co-propriétaires liés n'ont que des `@example.invalid`.
 *
 * ⚠️ LA RÈGLE DU LOT 2 EST INCHANGÉE, ET C'EST EXPRÈS : l'agence n'est toujours pas un GROUPE sélectionnable, et
 * ses adresses ne sont toujours pas listées. Ce qui change ici est plus étroit — un CLIENT du bien reste visible
 * dans son encart même quand son adresse est l'une des nôtres. Il n'est pas listé *en tant qu'agence* ; il est
 * listé en tant que client, et il ne filtre rien.
 */
export function adresseACorriger(adresse: string, interne: boolean): boolean {
  if (interne) return true;
  /* ⚠️ `.invalid` EST RÉSERVÉ PAR LA RFC 2606 : aucun courrier n'y arrive, par construction. On reconnaît donc le
     domaine entier, et non le seul `example.invalid` — un `test.invalid` est tout aussi mort. */
  return /\.invalid$/i.test(adresse.trim().toLowerCase());
}

/** La mention d'Arno, écrite une fois. PUR. */
export const MOT_ADRESSE_A_CORRIGER = 'adresse à corriger dans l’annuaire';

/**
 * 🔴 POURQUOI CETTE CAPSULE NE COCHE RIEN, dit en toutes lettres dans l'info-bulle : une couleur estompée ne dit
 * rien à qui ne la voit pas, et « désactivé » sans motif se lit comme une panne.
 */
export function motifNonSelectionnable(adresse: string, interne: boolean): string | null {
  if (!adresseACorriger(adresse, interne)) return null;
  return interne
    ? 'Cette adresse est une des nôtres : la cocher reviendrait à cocher notre agence, '
      + 'c’est-à-dire presque tous les mails du bien. À corriger dans l’annuaire.'
    : 'Cette adresse ne mène nulle part (domaine réservé « .invalid ») : elle ne peut filtrer aucun mail. '
      + 'À corriger dans l’annuaire.';
}

export const BUT_DU_PLUS =
  'Rattacher ce contact à une partie du bien, pour que ses prochains mails rejoignent ce bien tout seuls.';

export function partieDeplacable(
  adresse: string, categoriesFiche: ReadonlyMap<string, CategoriePartie>, interne = false,
): boolean {
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — CE VERDICT PASSE DÉSORMAIS PAR `sorteDeCapsule`, et il n'y a plus
   * qu'une définition de « client » et d'« agence » dans tout le module. Le résultat est le MÊME qu'avant ce lot,
   * au booléen près : seuls un client et l'agence étaient immobiles, et ils le restent.
   *
   * ⚠️ LE GROUPE N'ENTRE PAS DANS CE VERDICT, et c'est pourquoi on passe `'a_repartir'` : un tiers indépendant se
   * déplace comme n'importe quel contact — c'est même tout l'intérêt du rangement manuel. Passer le vrai groupe
   * aurait rendu `'tiers'` pour lui, qu'il aurait fallu accepter ici en plus de `'contact'` : deux valeurs à tenir
   * pour une seule idée.
   */
  return sorteDeCapsule(adresse, 'a_repartir', categoriesFiche, interne) === 'contact';
}

/**
 * ══ 🔴 CE QUE LE MESSAGE DIT APRÈS UN DÉPÔT ═════════════════════════════════════════════════════════════════════
 *
 * Arno : « après le dépôt, petit message “Fanny Rosky → Locataire” avec “Annuler” quelques secondes. »
 *
 * 🔴 LE NOM **ET** LA DESTINATION, parce que c'est la seule phrase qui permette de vérifier qu'on n'a pas lâché
 * la capsule une rangée trop bas. Un simple « Déplacé » aurait obligé à retrouver la capsule pour le savoir — et
 * c'est précisément ce qu'on vient de faire disparaître de l'écran.
 */
export function motDeplacement(nom: string, titreCible: string): string {
  return `${nom} → ${titreCible}`;
}

/**
 * Combien de secondes « Annuler » reste offert.
 *
 * ⚠️ HUIT SECONDES, ET NON DEUX : le temps de lire la phrase, de comprendre qu'on s'est trompé, et de viser.
 * C'est la durée retenue au lot INTERNE-ANNULER pour le même genre de geste — une seule convention dans
 * l'application, pour que « quelques secondes » veuille dire la même chose partout.
 */
export const SECONDES_ANNULER_DEPLACEMENT = 8;

/**
 * ══ 🔴 LES DESTINATIONS OFFERTES AU CLAVIER ═════════════════════════════════════════════════════════════════════
 *
 * Arno : « Accessible au clavier aussi (menu “Déplacer vers…” sur la capsule). » Le glisser-déposer n'existe pas
 * au clavier, et il n'existe pas non plus sous un doigt sur un téléphone : ce menu n'est donc pas une
 * concession, c'est le SECOND chemin indispensable — et il passe par la même porte d'écriture.
 *
 * ⚠️ LA CATÉGORIE D'ORIGINE EST ÉCARTÉE : proposer « déplacer vers là où tu es déjà » est un piège à clic.
 */
export function ciblesDeplacement(depuis: CleGroupeParties): { cle: CleGroupeParties; titre: string }[] {
  return [...GROUPES_EN_ENCART, ...GROUPES_EN_BANDE]
    .filter((c) => c !== depuis)
    .map((c) => ({ cle: c, titre: TITRES_GROUPES[c] }));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④-ter 🔴🔴 LOT HISTORIQUE-BIEN-3 — L'ENCART NE GRANDIT JAMAIS : IL DÉFILE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * La position d'une capsule dans son encart, en pixels, telle que le navigateur la donne.
 * `haut` = `offsetTop`, `hauteur` = `offsetHeight`.
 */
export interface PositionCapsule { haut: number; hauteur: number }

/**
 * ══ 🔴🔴 COMBIEN DE CAPSULES SONT CACHÉES SOUS LE BAS DE L'ENCART ? PUR. ════════════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Chaque encart garde la hauteur actuelle. Il ne grandit jamais. S'il y a plus de
 * contacts, son listing DÉFILE à l'intérieur de l'encart. Quand des contacts sont cachés sous le bas de l'encart,
 * une petite puce flottante en bas, centrée, “↓ 3 autres”, invite à défiler. »
 *
 * 🔴 « CACHÉE » VEUT DIRE « PAS ENTIÈREMENT VISIBLE », et c'est le seul seuil honnête. Une capsule dont on voit
 * trois pixels n'est pas lisible : l'annoncer comme visible aurait fait dire « ↓ 2 autres » là où il en reste
 * trois à lire, et le compte d'une puce qui invite à défiler doit être juste, sinon elle cesse d'être crue.
 *
 * ⚠️ LA TOLÉRANCE D'UN PIXEL N'EST PAS DE LA COQUETTERIE : les hauteurs rendues sont fractionnaires (un écran à
 * 2× donne des `offsetTop` en demi-pixels). Sans elle, la dernière capsule serait comptée « cachée » alors
 * qu'elle touche exactement le bas — et la puce ne disparaîtrait jamais.
 */
export const TOLERANCE_DEFILEMENT_PX = 1;

export function compteCacheesEnBas(
  positions: readonly PositionCapsule[], scrollTop: number, hauteurVisible: number,
): number {
  const bas = scrollTop + hauteurVisible + TOLERANCE_DEFILEMENT_PX;
  return positions.filter((p) => p.haut + p.hauteur > bas).length;
}

/** Combien de capsules sont passées AU-DESSUS du haut de l'encart. PUR. */
export function compteCacheesEnHaut(
  positions: readonly PositionCapsule[], scrollTop: number,
): number {
  return positions.filter((p) => p.haut + p.hauteur < scrollTop - TOLERANCE_DEFILEMENT_PX).length;
}

/**
 * ══ 🔴 LE MOT DE LA PUCE, ET IL DIT UN NOMBRE ═══════════════════════════════════════════════════════════════════
 *
 * Arno écrit « ↓ 3 autres ». Le NOMBRE est l'information : une flèche seule dirait « il y a autre chose » sans
 * dire s'il reste un contact ou quarante — or c'est précisément ce qui décide de défiler ou de replier.
 *
 * ⚠️ `null` QUAND IL N'Y A RIEN À MONTRER : la puce n'est alors pas rendue du tout. Une puce grisée aurait
 * occupé la place et fait croire à un bouton en panne.
 */
export function motCacheesEnBas(n: number): string | null {
  return n <= 0 ? null : `↓ ${n} autre${n > 1 ? 's' : ''}`;
}

/** La puce du haut ne compte pas : une fois défilé, « remonter » suffit, et le nombre déjà lu n'intéresse personne. */
export function motCacheesEnHaut(n: number): string | null {
  return n <= 0 ? null : '↑ remonter';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LE VERROU : « EN PLACE » NE S'ÉCRIT JAMAIS SUR UN LOGEMENT VACANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une tranche d'occupation, telle que la fiche et la route la donnent. `jusqua === null` ⇒ encore là. */
export interface OccupationPeriode {
  /** Le NOM de la personne. C'est lui qu'on écrit ; jamais une clé technique. */
  libelle: string;
  /** `AAAA-MM-JJ`, ou `null` quand l'export ne donne pas la date d'entrée. JAMAIS devinée. */
  depuis: string | null;
  /** `AAAA-MM-JJ` de sortie, ou `null` quand le bail court toujours. */
  jusqua: string | null;
}

/** « entré le 01/05/2025 », ou le constat que la date n'est pas connue. Jamais une date inventée. PUR. */
function motEntree(depuis: string | null): string {
  const d = formaterDateIso(depuis);
  return d === '' ? 'date d’entrée non renseignée' : `entré le ${d}`;
}

/**
 * ══ 🔴🔴 QUI OCCUPE CE LOGEMENT, SUR LA PÉRIODE ? ET S'IL EST VACANT, ON LE DIT. PUR. ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT QUE CETTE FONCTION EXISTE POUR INTERDIRE, VU DANS LA MAQUETTE DE L'ÉTUDE. L'écran annonçait
 * « locataire en place depuis le 08/06/2025 » sur un logement **vacant depuis le 28/09/2026**. Deux mensonges
 * dans une seule phrase :
 *   ① « en place » — il n'y avait PERSONNE dans le logement ;
 *   ② « 08/06/2025 » — une date DEVINÉE : la vraie entrée était le **01/05/2025**.
 *
 * 🔴 CE QUE ÇA COÛTE, ET POURQUOI C'EST PIRE QU'UN ÉCRAN VIDE. On écrit au locataire « en place » pour un état
 * des lieux, une régularisation de charges, un préavis. La phrase est lue, crue, et sert à agir — alors qu'elle
 * décrit un logement vide depuis une semaine. Un écran qui ne dirait rien aurait fait ouvrir la fiche ; celui-là
 * fait écrire à quelqu'un qui est parti.
 *
 * 🔴 LA RÈGLE, SANS EXCEPTION : « EN PLACE » NE PEUT S'ÉCRIRE QUE S'IL EXISTE UNE OCCUPATION OUVERTE. Une
 * occupation est ouverte quand elle n'a pas de sortie, ou quand sa sortie n'est pas encore passée (le jour de la
 * sortie, il a encore les clés — même convention de borne haute INCLUSE que tout le module).
 *
 * ⚠️ « VACANT DEPUIS » EST LA DATE DE SORTIE DU DERNIER LOCATAIRE, TELLE QUELLE — pas le lendemain. Calculer un
 * lendemain, c'est produire une date que la base ne porte pas ; et la seule date qu'on puisse montrer sans
 * mentir est celle qu'on a. Elle est donc écrite avec le mot qui dit ce qu'elle est.
 *
 * ⚠️ AUCUNE OCCUPATION CONNUE N'EST PAS « VACANT » : c'est « on ne sait pas ». Un logement sans occupation en
 * base peut être occupé par quelqu'un que l'export n'a jamais nommé — l'écrire vacant serait affirmer une
 * absence qu'on n'a pas vérifiée (piège du lot 71 : l'ensemble vide n'est pas une réponse satisfaite).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function motLocataireDeLaPeriode(
  occupations: readonly OccupationPeriode[], maintenant: Date,
): string {
  if (occupations.length === 0) return 'Aucun locataire connu pour ce logement.';

  const aujourdhui = jourParis(maintenant);
  const enPlace = occupations.filter((o) => occupationOuverte(o, aujourdhui));
  if (enPlace.length > 0) {
    const noms = enPlace.map((o) => `${o.libelle} (${motEntree(o.depuis)})`).join(' · ');
    return enPlace.length === 1
      ? `Locataire en place : ${noms}`
      : `Locataires en place : ${noms}`;
  }

  /* LE DERNIER PARTI : celui dont la sortie est la plus récente. L'égalité se tranche sur l'entrée, puis sur le
     nom — jamais laissée au hasard du tri, qui changerait l'affichage d'un rendu à l'autre. */
  const dernier = [...occupations].sort((a, b) => {
    const s = (b.jusqua ?? '').localeCompare(a.jusqua ?? '');
    if (s !== 0) return s;
    const e = (b.depuis ?? '').localeCompare(a.depuis ?? '');
    return e !== 0 ? e : a.libelle.localeCompare(b.libelle);
  })[0];

  const sortie = formaterDateIso(dernier.jusqua);
  const quand = sortie === '' ? 'date de sortie non renseignée' : `depuis le ${sortie}`;
  return `Logement vacant ${quand} · dernier locataire ${dernier.libelle}, ${motEntree(dernier.depuis)}`;
}

/**
 * LES ANCIENS LOCATAIRES SONT **VISIBLES ET SÉLECTIONNABLES**, CHACUN AVEC SA PÉRIODE. PUR.
 *
 * Demande d'Arno. Ce qui se choisit, c'est une PÉRIODE : cliquer « MARTY Jean-François (du 01/05/2025 au
 * 28/09/2026) » règle les deux dates du tableau de bord sur SON bail. C'est la question qu'on pose vraiment —
 * « qu'est-ce qui s'est dit du temps de ce locataire ? ».
 *
 * ⚠️ UNE OCCUPATION SANS AUCUNE DATE RESTE PROPOSÉE, et son choix ne règle alors RIEN (`du` et `au` à `null`) :
 * l'écarter de la liste aurait fait disparaître un locataire réel parce que l'export est incomplet.
 */
export function periodeDeLOccupation(o: OccupationPeriode): { du: string | null; au: string | null } {
  return {
    du: jourValide((o.depuis ?? '').slice(0, 10)),
    au: jourValide((o.jusqua ?? '').slice(0, 10)),
  };
}

/**
 * ══ 🔴🔴 UN BAIL EST-IL OUVERT CE JOUR-LÀ ? PUR. ═════════════════════════════════════════════════════════════════
 *
 * 🔴 EXTRAITE AU LOT HISTORIQUE-BIEN-2, ET LE MOT « EXTRAITE » COMPTE : ce prédicat vivait DANS
 * `motLocataireDeLaPeriode`. « Depuis l'entrée du dernier locataire » a besoin exactement du même verdict, et le
 * recopier aurait fait deux juges pour « y a-t-il quelqu'un dans le logement ? » — c'est-à-dire, un jour, un
 * bouton qui propose la période d'un locataire parti pendant que la phrase du dessus annonce qu'il est en place.
 * Le corps n'a pas changé d'un caractère ; seul son emplacement l'a fait.
 *
 * ⚠️ UNE SORTIE ABÎMÉE N'OUVRE PAS LE BAIL : `jusqua` renseignée mais illisible veut dire « il y a eu une
 * sortie ». La lire comme `null` aurait écrit « en place » sur la foi d'une donnée cassée.
 *
 * ⚠️ BORNE HAUTE **INCLUSE** : le jour de la sortie, il a encore les clés. Même convention que tout le module.
 */
export function occupationOuverte(o: OccupationPeriode, jour: string): boolean {
  const fin = jourValide((o.jusqua ?? '').slice(0, 10));
  if ((o.jusqua ?? '').trim() !== '' && fin === null) return false;
  return fin === null || fin >= jour;
}

/**
 * ══ 🔴🔴 QUI EST « LE DERNIER LOCATAIRE » ? PUR. ═════════════════════════════════════════════════════════════════
 *
 * Celui qui est là s'il y a quelqu'un ; sinon le dernier parti. C'est la lecture qu'une personne fait du mot, et
 * c'est celle qu'il faut : sur un logement occupé, « le dernier locataire » désigne l'occupant, pas son
 * prédécesseur.
 *
 * ⚠️ L'ÉGALITÉ EST TOUJOURS TRANCHÉE, jamais laissée au hasard du tri. Parmi les occupants en place, on prend
 * l'entrée la plus récente ; parmi les partis, la sortie la plus récente, puis l'entrée, puis le nom. Un
 * comparateur qui laisse des ex æquo rend un bouton qui change de période d'un affichage à l'autre.
 *
 * ⚠️ `null` QUAND LE LOGEMENT N'A JAMAIS EU DE LOCATAIRE CONNU, et c'est ce `null` qui grise le bouton. Rendre
 * une période vide aurait donné un bouton cliquable qui ne filtre rien — pire qu'un bouton éteint, parce qu'on
 * croit avoir filtré.
 */
export function dernierLocataire(
  occupations: readonly OccupationPeriode[], maintenant: Date,
): OccupationPeriode | null {
  if (occupations.length === 0) return null;
  const aujourdhui = jourParis(maintenant);
  const enPlace = occupations.filter((o) => occupationOuverte(o, aujourdhui));
  if (enPlace.length > 0) {
    return [...enPlace].sort((a, b) => {
      const e = (b.depuis ?? '').localeCompare(a.depuis ?? '');
      return e !== 0 ? e : a.libelle.localeCompare(b.libelle);
    })[0];
  }
  return [...occupations].sort((a, b) => {
    const srt = (b.jusqua ?? '').localeCompare(a.jusqua ?? '');
    if (srt !== 0) return srt;
    const e = (b.depuis ?? '').localeCompare(a.depuis ?? '');
    return e !== 0 ? e : a.libelle.localeCompare(b.libelle);
  })[0];
}

/**
 * ══ 🔴🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » : SA PÉRIODE. PUR. ═════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot : « début = sa date d'entrée, fin = sa sortie ou aujourd'hui ». C'est donc la
 * période de SON bail, et non « depuis son entrée jusqu'à maintenant » : sur un logement vacant, le fil
 * s'arrête à sa sortie, et ce qui s'est dit après (la remise en location) ne se mêle pas à son dossier.
 *
 * ⚠️ UNE ENTRÉE INCONNUE RESTE `null`, ELLE NE DEVIENT PAS UNE DATE DEVINÉE : c'est exactement l'erreur que la
 * maquette de l'étude avait commise (« en place depuis le 08/06/2025 » pour une entrée réelle au 01/05/2025).
 * Le fil montre alors tout ce qui précède la sortie, et la phrase de droite dit « jusqu'au … » — honnêtement.
 *
 * ⚠️ `null` QUAND IL N'Y A AUCUN LOCATAIRE CONNU : c'est le cas que le bouton grise, avec son explication.
 */
export function periodeDuDernierLocataire(
  occupations: readonly OccupationPeriode[], maintenant: Date,
): BornesPeriode | null {
  const o = dernierLocataire(occupations, maintenant);
  if (o === null) return null;
  const p = periodeDeLOccupation(o);
  return { du: p.du, au: p.au ?? jourParis(maintenant) };
}

/**
 * Pourquoi « Un événement » est grisé. Dit en toutes lettres, jamais une couleur seule.
 *
 * ⚠️ « AUCUN ÉVÉNEMENT » N'EST PAS « ILLISIBLE », et l'écran distingue les deux : un bien sans événement est un
 * fait ordinaire, une lecture qui a échoué est une panne. Les confondre aurait fait passer une panne pour un
 * logement calme — piège du lot 71, l'ensemble vide n'est pas une réponse satisfaite.
 */
export const SANS_EVENEMENT = 'Ce bien ne porte aucun événement, ni en cours ni clos.';

/** Pourquoi « Depuis l'entrée du dernier locataire » est grisé. Dit en toutes lettres, jamais une couleur seule. */
export const SANS_LOCATAIRE_CONNU =
  'Ce logement n’a aucun locataire connu dans l’annuaire : il n’y a pas d’entrée à partir de laquelle compter.';

/**
 * ══ 🔴🔴 LA PÉRIODE EFFECTIVE, ÉCRITE EN CLAIR. PUR. ═════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « La période effective est toujours affichée en clair à droite (“du 01/05/2025 au
 * 04/10/2026”). »
 *
 * 🔴 « TOUJOURS », ET C'EST TOUT L'INTÉRÊT. Quatre boutons proposent des périodes qu'on ne voit pas : choisir un
 * événement règle deux dates qu'il faut aller lire dans les champs, et choisir un locataire aussi. La phrase les
 * rend lisibles d'un coup d'œil — et elle est la SEULE chose qui rende visible le fait qu'on a, ensuite, modifié
 * une borne à la main.
 *
 * ⚠️ LES QUATRE CAS SONT DITS, Y COMPRIS LES DEMI-BORNES. Une période ouverte d'un côté est fréquente (un bail
 * en cours, une entrée inconnue) ; écrire « du … au … » avec un trou aurait produit « du au 04/10/2026 ».
 */
export function motPeriodeEffective(p: ChoixPeriode, maintenant?: Date): string {
  const { du, au } = bornesDuChoix(p);
  const d = formaterDateIso(jourValide(du));
  const a = formaterDateIso(jourValide(au));
  if (d === '' && a === '') return 'tous les échanges, sans borne de date';
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 4 — « AUJOURD'HUI » AU LIEU DE LA DATE DU JOUR ═══════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « quand la date de fin est aujourd'hui, écrire “aujourd'hui” au lieu de la
   * date (ex. “du 01/02/2025 à aujourd'hui”). Même règle dans les choix “Depuis l'entrée du dernier locataire”,
   * “Un événement” (en cours) et “Dates personnalisées”. »
   *
   * 🔴 LES TROIS CHOIX PASSENT DÉJÀ PAR ICI, ET C'EST POURQUOI UNE SEULE CORRECTION SUFFIT. Aucun des trois
   * boutons n'affiche de date lui-même : ils RÈGLENT les bornes, et c'est cette phrase — « Période retenue » —
   * qui les écrit. Un événement EN COURS borne au jour même (`periodeDeLEvenement`), un bail en cours ne borne
   * pas du tout (`au: null` ⇒ « depuis le … »), et « Dates personnalisées » prend ce qu'on y saisit.
   *
   * 🔴 LA PRÉPOSITION CHANGE AVEC LE MOT, et c'est la phrase d'Arno qui le dit : « du 01/02/2025 **à**
   * aujourd'hui », et non « au aujourd'hui ». De même « jusqu'à aujourd'hui » et non « jusqu'au aujourd'hui ».
   *
   * ⚠️ `maintenant` EST FACULTATIF, et sans lui la phrase est celle d'avant ce lot, au caractère près : une date
   * en clair. Les deux appelants qui ne connaissent pas l'heure (un test de bornes, un rendu hors écran) ne
   * changent donc pas de comportement — et surtout, cette fonction reste PURE : elle ne lit pas l'horloge
   * elle-même. Une fonction qui appellerait `new Date()` ne pourrait pas être éprouvée deux jours de suite.
   */
  const cejour = maintenant === undefined ? '' : formaterDateIso(jourParis(maintenant));
  const finAujourdhui = cejour !== '' && a === cejour;
  if (d !== '' && a !== '') return finAujourdhui ? `du ${d} à aujourd’hui` : `du ${d} au ${a}`;
  if (d !== '') return `depuis le ${d}`;
  return finAujourdhui ? 'jusqu’à aujourd’hui' : `jusqu’au ${a}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-bis 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — REVENIR EXACTEMENT OÙ L'ON ÉTAIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 TOUT CE QU'IL FAUT POUR RETROUVER L'ÉCRAN AU PIXEL ═════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Le bouton RETOUR du navigateur, et un bouton “← Retour à l'historique du bien”
 * dans la conversation, ramènent EXACTEMENT au même état : même fiche, même période, mêmes parties cochées,
 * mêmes options, même texte de recherche, même position de défilement, et le mail d'où l'on est parti surligné
 * brièvement. L'état vit dans l'adresse de la page (paramètres d'URL) pour survivre au retour. »
 *
 * 🔴🔴 CE QUI VOYAGE DANS L'ADRESSE EST UN **JETON**, PAS CET OBJET — ET C'EST UN ÉCART QUE JE DOIS DIRE. Cet
 * état porte les ADRESSES DES PERSONNES cochées, et le texte de recherche (souvent un nom). Les écrire dans une
 * adresse les met dans l'historique du navigateur, dans les journaux du serveur et dans tout lien copié : ce
 * dépôt refuse cela partout ailleurs, et je ne vais pas l'autoriser ici pour une commodité de navigation.
 * L'adresse porte donc une clé courte et anonyme ; CET objet vit dans le `sessionStorage` de l'onglet, sous
 * cette clé. L'exigence d'Arno est tenue — le retour retrouve l'écran exact — par un chemin qui ne publie rien.
 *
 * ⚠️ `fiche` EST GARDÉE ET VÉRIFIÉE AU RETOUR : un jeton qui désignerait l'état d'un AUTRE bien doit être
 * ignoré, pas appliqué. C'est le genre de confusion qu'un copier-coller d'adresse produit tout seul.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface EtatRetourBien {
  /** La clé WIPPIMMO du bien dont c'est l'état. Vérifiée au retour : un état d'un autre bien est écarté. */
  fiche: string;
  reglages: Reglages;
  /** Le défilement de la PAGE, en pixels. `0` = le haut. */
  defile: number;
  /** Le mail d'où l'on est parti : il sera surligné brièvement au retour. */
  mail: number | null;
  /** Le rang de page du fil, pour ne pas revenir sur la première quand on lisait la troisième. */
  page: number;
}

/** Le préfixe des clés du `sessionStorage`. Nommé ici pour que l'écriture et la lecture ne puissent pas divergEr. */
export const CLE_RETOUR_BIEN = 'hdb-retour:';

/**
 * ══ 🔴 RELIRE UN ÉTAT DE RETOUR, EN SE MÉFIANT ══════════════════════════════════════════════════════════════════
 *
 * Il vient du `sessionStorage`, donc d'une version antérieure de l'application aussi bien que de la nôtre.
 * Chaque champ est donc VÉRIFIÉ, et un seul champ abîmé fait rendre `null` : appliquer un état à moitié lu
 * donnerait un écran qui ne ressemble ni à celui qu'on a quitté ni au défaut — le pire des trois.
 *
 * ⚠️ `parties` EST BORNÉE À 200 ADRESSES : le bien le plus fourni en compte 76, et une borne empêche un
 * `sessionStorage` abîmé de faire une requête démesurée.
 */
export function etatRetourDepuisBrut(v: unknown): EtatRetourBien | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const r = o.reglages as Record<string, unknown> | undefined;
  if (typeof o.fiche !== 'string' || o.fiche === '' || typeof r !== 'object' || r === null) return null;

  const p = r.periode as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return null;
  const sorte = p.sorte;
  if (sorte !== 'tous' && sorte !== 'dates' && sorte !== 'occupation' && sorte !== 'evenement') return null;
  const jour = (x: unknown): string | null => (typeof x === 'string' ? jourValide(x) : null);
  const periode: ChoixPeriode = sorte === 'tous'
    ? { sorte: 'tous' }
    : sorte === 'evenement'
      ? {
        sorte: 'evenement',
        evenementId: typeof p.evenementId === 'number' && Number.isSafeInteger(p.evenementId) ? p.evenementId : 0,
        du: jour(p.du), au: jour(p.au),
      }
      : { sorte, du: jour(p.du), au: jour(p.au) };

  const pieces = r.pieces;
  const ordre = r.ordre;
  const nombre = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return {
    fiche: o.fiche,
    reglages: {
      periode,
      parties: Array.isArray(r.parties)
        ? r.parties.filter((x): x is string => typeof x === 'string').slice(0, 200)
        : [],
      toutesLesParties: r.toutesLesParties !== false,
      pieces: pieces === 'avec' || pieces === 'sans' ? pieces : 'toutes',
      ordre: ordre === 'ancien' ? 'ancien' : 'recent',
      grouper: r.grouper === true,
      texte: typeof r.texte === 'string' ? r.texte.slice(0, 200) : '',
      evenementOuvert: r.evenementOuvert === true,
    },
    defile: nombre(o.defile),
    mail: typeof o.mail === 'number' && Number.isSafeInteger(o.mail) && o.mail > 0 ? o.mail : null,
    page: nombre(o.page),
  };
}

/**
 * Combien de temps le mail d'où l'on vient reste surligné au retour.
 *
 * ⚠️ « BRIÈVEMENT » (Arno) : assez pour que l'œil le trouve, assez peu pour qu'il ne reste pas marqué comme s'il
 * avait un état particulier. Deux secondes et demie — la durée d'un regard, pas d'une sélection.
 */
export const MS_SURLIGNE_RETOUR = 2500;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LES RÉGLAGES, RENDUS EN PARAMÈTRES POUR LA ROUTE EXISTANTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 LES RÉGLAGES, TRADUITS EN FILTRES DE LA ROUTE. PUR. ═══════════════════════════════════════════════════════
 *
 * 🔴 IL RÉEMPLOIE `ecrireFiltres`, SANS LE MODIFIER D'UNE VIRGULE. La route sait déjà lire `avec`, `du`, `au`,
 * `pieces` et `grouper` ; en écrire une seconde sérialisation aurait fait deux grammaires d'adresse pour la même
 * question — et c'est toujours celle qu'on relit le moins qui se périme.
 *
 * ⚠️ `toutesLesParties` ALLUMÉ ⇒ **AUCUN** `avec`, et les cases cochées sont conservées dans `Reglages` sans être
 * envoyées. C'est la demande d'Arno : l'interrupteur IGNORE le choix des parties, il ne l'efface pas.
 *
 * ⚠️ L'ORDRE N'EST **PAS** UN PARAMÈTRE DE ROUTE, ET C'EST EXACT : la route rend toujours le plus récent d'abord.
 * L'inversion se fait à l'écran, sur la page reçue. Lui inventer un `ordre=` aurait promis à l'adresse un tri que
 * le serveur ne sait pas faire — un paramètre ignoré en silence est pire qu'un paramètre absent.
 */
export function reglagesEnFiltres(r: Reglages, page = 0, taille = PAGE_HISTORIQUE): FiltresHistorique {
  /* 🔴 LES BORNES PASSENT PAR `bornesDuChoix`, ET PAR RIEN D'AUTRE (lot HISTORIQUE-BIEN-2) : la phrase affichée
     à droite du bloc PÉRIODE lit la même fonction. Deux lectures séparées auraient pu divergEr en silence. */
  const bornes = bornesDuChoix(r.periode);
  return {
    ...FILTRES_VIDES,
    interlocuteurs: r.toutesLesParties
      ? []
      : [...new Set(r.parties.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))],
    du: jourValide(bornes.du),
    au: jourValide(bornes.au),
    pieces: r.pieces,
    /**
     * ══ 🔴🔴 LA RECHERCHE NE PART PLUS AU SERVEUR (lot HISTORIQUE-BIEN-3, point 5) ═══════════════════════════
     *
     * DEMANDE D'ARNO (05/10/2026) : « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà
     * affichée (période + parties + options) : objet, texte, nom de l'expéditeur, nom des pièces. »
     *
     * 🔴 ELLE NE VA DONC PLUS CHERCHER DE MAILS, ELLE EN RETIRE — et c'est ce qui permet d'ajouter l'expéditeur
     * et le nom des pièces, deux champs que la route ne sait pas interroger. `texte` reste VIDE dans les
     * filtres : l'envoyer aurait fait deux tamis pour une seule question, et le compteur « N sur M » aurait
     * compté sur une sélection que la route avait déjà réduite.
     *
     * ⚠️ LE RÉGLAGE, LUI, EXISTE TOUJOURS (`Reglages.texte`) : c'est l'écran qui l'applique, par
     * `filtrerParMots`. Et il compte toujours comme un réglage ACTIF, pour qu'on puisse le défaire.
     */
    texte: '',
    evenementOuvert: r.evenementOuvert,
    /**
     * 🔴 `grouper` RESTE **FAUX**, TOUJOURS, ET CE N'EST PAS UN OUBLI. Le `grouper=1` de la route regroupe par
     * CIBLE (l'historique d'un propriétaire, séparé par logement) ; le réglage « Regrouper par conversation »
     * regroupe par ÉCHANGE, à l'écran. Les relier aurait donné un regroupement qui ne regroupe rien sur un bien,
     * ET transformé le `DISTINCT ON (message_id)` de la requête en `DISTINCT` — un mail arrivant par deux axes
     * aurait alors été listé deux fois. Voir l'encadré de `Reglages.grouper`.
     */
    grouper: false,
    page,
    taille,
  };
}

/** La chaîne de requête, prête à coller après `?cible=lot-…`. Vide quand rien n'est filtré. PUR. */
export function reglagesEnParametres(r: Reglages, page = 0, taille = PAGE_HISTORIQUE): string {
  return ecrireFiltres(reglagesEnFiltres(r, page, taille));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ LE FIL, ET LE RÉSUMÉ DES PIÈCES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE FIL, DANS L'ORDRE DEMANDÉ. PUR.
 *
 * 🔴 TRI À LA SECONDE, ET L'ÉGALITÉ TRANCHÉE PAR L'IDENTIFIANT — exactement comme `piecesDeLaConversation`, et
 * pour la même raison : deux mails horodatés à la même seconde (un envoi automatique en rafale) donneraient
 * sinon un ordre qui change d'un affichage à l'autre, et l'on croirait la liste instable.
 *
 * ⚠️ UNE DATE ILLISIBLE SE COMPORTE COMME LA PLUS ANCIENNE, jamais comme « maintenant » : un mail dont
 * l'horodatage est abîmé ne doit pas s'imposer en tête du fil.
 */
export function trierFil(lignes: readonly LigneHistorique[], ordre: OrdreFil): LigneHistorique[] {
  const sens = ordre === 'recent' ? -1 : 1;
  return [...lignes]
    .map((l) => ({ l, t: Date.parse(l.recuLe) }))
    .sort((a, b) => {
      const ta = Number.isNaN(a.t) ? -Infinity : a.t;
      const tb = Number.isNaN(b.t) ? -Infinity : b.t;
      if (ta !== tb) return (ta - tb) * sens;
      return (a.l.messageId - b.l.messageId) * sens;
    })
    .map((x) => x.l);
}

/** Un échange du fil regroupé : son identifiant, son objet le plus récent, et ses mails dans l'ordre demandé. */
export interface ConversationDuFil {
  filId: number;
  /**
   * L'objet du PREMIER mail du groupe DANS L'ORDRE AFFICHÉ — c'est sous ce nom qu'on reconnaît l'échange.
   *
   * ⚠️ IL PEUT DONC CHANGER QUAND ON INVERSE L'ORDRE, et c'est exact : en « plus récent en haut » on lit l'objet
   * du dernier état de l'échange, en « plus ancien en haut » celui qui l'a ouvert. Figer l'un des deux aurait
   * obligé à retrier à l'intérieur du groupe — donc à décider de l'ordre à un second endroit.
   */
  objet: string | null;
  lignes: LigneHistorique[];
}

/**
 * ══ 🔴 LE FIL, REGROUPÉ PAR CONVERSATION. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Regrouper par conversation », décoché par défaut.
 *
 * ⚠️ L'ORDRE DES GROUPES SUIT L'ORDRE DEMANDÉ, APPLIQUÉ AU PREMIER MAIL DE CHACUN — jamais l'ordre alphabétique
 * ni l'identifiant d'échange. En « plus récent en haut », l'échange qui a bougé en dernier est en haut : c'est
 * « où en est-on ? », la question qu'on pose en regroupant. À l'intérieur d'un groupe, l'ordre reçu est conservé.
 *
 * ⚠️ ELLE NE RETRIE RIEN : elle reçoit un fil DÉJÀ classé par `trierFil` et ne fait que le découper. Un second
 * tri ici aurait donné deux endroits où l'ordre se décide, et le bouton d'inversion aurait pu cesser d'agir sur
 * les groupes sans que rien ne le dise.
 */
export function grouperParConversation(lignes: readonly LigneHistorique[]): ConversationDuFil[] {
  const out: ConversationDuFil[] = [];
  const index = new Map<number, number>();
  for (const l of lignes) {
    const place = index.get(l.filId);
    if (place === undefined) {
      index.set(l.filId, out.push({ filId: l.filId, objet: l.objet, lignes: [l] }) - 1);
      continue;
    }
    out[place].lignes.push(l);
  }
  return out;
}

/**
 * ══ 🔴 LES LIGNES DU FIL, RENDUES LISIBLES PAR `piecesDeLaConversation`. PUR. ════════════════════════════════════
 *
 * 🔴 UNE ADAPTATION, PAS UN SECOND TRI. Le classement « par date et par expéditeur » des pièces vit UNE fois,
 * dans `piecesConversation.ts` (`piecesDeLaConversation`, `dedoublonnerPieces`, `grouperParMessage`), et c'est
 * lui qui alimente déjà le récapitulatif d'une conversation. Cette fonction ne fait que présenter les lignes
 * d'historique sous la forme que ce module attend — et c'est précisément ce qui garantit que le résumé du bloc
 * « Historique » range les pièces exactement comme celui d'une conversation.
 *
 * ⚠️ `empreinte` VOYAGE, ET IL FALLAIT. Sans elle, `dedoublonnerPieces` identifie un fichier par « nom + taille »
 * et marque le rapprochement comme une PRÉSOMPTION. `PieceHistorique.empreinte` est facultative (réponse d'API
 * antérieure au lot) : `?? null` est donc la valeur que le repli attend, pas un oubli.
 */
export function messagesDuFil(lignes: readonly LigneHistorique[]): MessagePorteur[] {
  return lignes.map((l) => ({
    messageId: l.messageId,
    recuLe: l.recuLe,
    sens: l.sens,
    de: l.de,
    deNom: l.deNom,
    objet: l.objet,
    pieces: l.pieces.map((p) => ({
      pieceId: p.pieceId,
      nomFichier: p.nomFichier,
      typeMime: p.typeMime,
      tailleOctets: p.tailleOctets,
      disponible: p.disponible,
      motifNonStocke: p.motifNonStocke,
      empreinte: p.empreinte ?? null,
    })),
  }));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦-bis 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LA RECHERCHE, DANS LA SÉLECTION DÉJÀ AFFICHÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 NORMALISER UN TEXTE POUR LA COMPARAISON : SANS ACCENT, SANS CASSE. PUR. ══════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « accents et majuscules ignorés ».
 *
 * 🔴 `NFD` PUIS RETRAIT DES DIACRITIQUES, et non une table de correspondances écrite à la main. Une table
 * oublie toujours un caractère — le « ÿ », le « œ », les accents des noms d'Europe centrale qu'on croise dans un
 * immeuble. La décomposition Unicode, elle, ne demande à personne d'avoir pensé à tout.
 */
export function normaliserRecherche(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Les mots cherchés, normalisés et dédoublonnés. Vide quand il n'y a rien à chercher.
 *
 * ⚠️ BORNÉ À HUIT MOTS : au-delà, ce n'est plus une recherche, et chaque mot coûte un parcours de tout l'écran.
 */
export function motsRecherches(texte: string): string[] {
  return [...new Set(normaliserRecherche(texte).split(/\s+/).filter((m) => m !== ''))].slice(0, 8);
}

/** Ce sur quoi la recherche porte, pour un mail. Assemblé une fois, lu autant de fois qu'il y a de mots. */
function matiereDuMail(l: LigneHistorique): string {
  return normaliserRecherche([
    l.objet ?? '',
    l.extrait ?? '',
    l.deNom ?? '',
    l.de,
    ...l.pieces.map((p) => p.nomFichier),
  ].join(' '));
}

/**
 * ══ 🔴🔴 FILTRER LES MAILS AFFICHÉS PAR MOTS-CLÉS. PUR. ══════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO, mot pour mot : « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà affichée
 * (période + parties + options) : objet, texte, nom de l'expéditeur, nom des pièces. Plusieurs mots = tous
 * présents ; accents et majuscules ignorés. »
 *
 * 🔴 CE QUI CHANGE PAR RAPPORT AU LOT PRÉCÉDENT, ET IL FAUT LE DIRE. La recherche partait au SERVEUR (`q=`), qui
 * cherchait dans l'objet et le texte de TOUT le bien. Elle devient un filtre de l'écran : elle ne va plus
 * chercher de mails, elle en RETIRE. C'est ce qu'Arno demande (« uniquement dans la sélection déjà affichée »),
 * et c'est ce qui permet d'ajouter l'expéditeur et le nom des pièces — deux champs que la route ne sait pas
 * interroger. La contrepartie est réelle et doit être dite : elle ne porte que sur la PAGE affichée.
 *
 * 🔴 « TOUS PRÉSENTS », et non « au moins un ». C'est ce qui rend la recherche utile sur un bien bavard :
 * « fuite cuisine » doit rendre les mails qui parlent des deux, pas la somme des deux listes.
 *
 * ⚠️ UN MOT PEUT ÊTRE TROUVÉ DANS DES CHAMPS DIFFÉRENTS : « rosky » dans l'expéditeur et « bail » dans l'objet
 * suffisent. Exiger les deux dans le MÊME champ aurait écarté le cas le plus fréquent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function filtrerParMots(
  lignes: readonly LigneHistorique[], texte: string,
): LigneHistorique[] {
  const mots = motsRecherches(texte);
  if (mots.length === 0) return [...lignes];
  return lignes.filter((l) => {
    const m = matiereDuMail(l);
    return mots.every((x) => m.includes(x));
  });
}

/**
 * ══ 🔴 « N MAILS SUR M » ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « le compteur “N mails sur M” se met à jour en direct ».
 *
 * ⚠️ `null` QUAND AUCUNE RECHERCHE N'EST EN COURS : le compteur du titre dit déjà le total, et un « 25 mails sur
 * 25 » permanent serait du bruit qu'on apprend à ne plus lire.
 */
export function motCompteurRecherche(trouves: number, affiches: number, cherche: boolean): string | null {
  if (!cherche) return null;
  return `${trouves} mail${trouves > 1 ? 's' : ''} sur ${affiches}`;
}

/**
 * ══ 🔴🔴 DÉCOUPER UN TEXTE POUR SURLIGNER LES MOTS TROUVÉS. PUR. ════════════════════════════════════════════════
 *
 * Arno : « les mots trouvés sont surlignés dans l'aperçu ».
 *
 * 🔴 ELLE REND DES MORCEAUX, PAS DU HTML. Rendre une chaîne balisée aurait obligé l'écran à l'injecter sans
 * échappement — c'est-à-dire à faire confiance au corps d'un mail reçu. Les morceaux, eux, sont posés par React,
 * qui échappe tout. Ce n'est pas une précaution de style : l'aperçu vient d'un courrier que n'importe qui envoie.
 *
 * ⚠️ LA RECHERCHE EST SANS ACCENT, MAIS LE TEXTE RENDU GARDE LES SIENS : on cherche sur une copie normalisée et
 * l'on découpe le texte D'ORIGINE aux mêmes positions. La normalisation employée ne change aucune longueur
 * (elle retire des diacritiques combinants, pas des caractères de base), ce qui rend les positions comparables ;
 * un repli garde le texte entier si jamais elles divergent.
 */
export interface MorceauSurligne { texte: string; trouve: boolean }

export function decouperPourSurligner(texte: string, mots: readonly string[]): MorceauSurligne[] {
  if (texte === '' || mots.length === 0) return [{ texte, trouve: false }];
  const plat = normaliserRecherche(texte);
  if (plat.length !== texte.length) return [{ texte, trouve: false }];

  /* Les intervalles trouvés, fusionnés : deux mots qui se chevauchent ne doivent pas produire deux balises. */
  const bornes: { a: number; b: number }[] = [];
  for (const m of mots) {
    let i = plat.indexOf(m);
    while (i !== -1) {
      bornes.push({ a: i, b: i + m.length });
      i = plat.indexOf(m, i + m.length);
    }
  }
  if (bornes.length === 0) return [{ texte, trouve: false }];
  bornes.sort((x, y) => x.a - y.a);
  const fusion: { a: number; b: number }[] = [];
  for (const x of bornes) {
    const dernier = fusion[fusion.length - 1];
    if (dernier !== undefined && x.a <= dernier.b) dernier.b = Math.max(dernier.b, x.b);
    else fusion.push({ ...x });
  }

  const out: MorceauSurligne[] = [];
  let pos = 0;
  for (const x of fusion) {
    if (x.a > pos) out.push({ texte: texte.slice(pos, x.a), trouve: false });
    out.push({ texte: texte.slice(x.a, x.b), trouve: true });
    pos = x.b;
  }
  if (pos < texte.length) out.push({ texte: texte.slice(pos), trouve: false });
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦-ter 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — LE MOT DU RÉSUMÉ, ET SA BASCULE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 « 13 PIÈCES DANS CETTE SÉLECTION » ═════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Le bouton “13 pièces — voir les pièces” devient “13 pièces dans cette
 * sélection — les voir” (et “— les masquer” quand elles sont ouvertes). »
 *
 * 🔴 LES TROIS MOTS AJOUTÉS SONT LA CORRECTION DU POINT 1, DITE À L'ÉCRAN. Le résumé couvre la SÉLECTION, pas la
 * page : c'est précisément ce que l'ancien libellé laissait croire, et ce qui a fait croire à Arno que les pièces
 * de la locataire avaient disparu. Un libellé qui dit son périmètre vaut mieux qu'une note en dessous.
 */
export function motPiecesSelection(n: number): string {
  return `${n} pièce${n > 1 ? 's' : ''} dans cette sélection`;
}

/**
 * Le mot de la bascule. PUR.
 *
 * ⚠️ IL DIT CE QUE LE CLIC VA FAIRE, et non l'état en cours — convention inverse de celle du bouton d'ordre, et
 * c'est voulu : « Plus récent en haut » DÉCRIT un tri qu'on lit, « les voir » PROMET une action. Confondre les
 * deux ferait un bouton qui annonce « les masquer » sur un résumé déjà masqué.
 */
export function motBasculeResume(ouvert: boolean): string {
  return ouvert ? '— les masquer' : '— les voir';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑧ CE QUE L'ÉCRAN DIT QUAND IL N'Y A RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 « AUCUN RÉSULTAT » DOIT ACCUSER LES RÉGLAGES, JAMAIS LE BIEN. PUR. ════════════════════════════════════════
 *
 * Un fil vide se lit spontanément « on n'a jamais rien écrit à propos de ce logement » — et c'est faux dès qu'un
 * réglage est actif. Le mot dit donc LEQUEL des deux on regarde, et l'écran pose à côté le bouton qui défait tout.
 *
 * ⚠️ LE CAS « AUCUNE PARTIE COCHÉE » EST DIT À PART, parce que son remède n'est pas le même : il ne s'agit pas
 * d'élargir une période, mais de cocher quelqu'un (ou de relever « tous les mails du bien »).
 */
export function motAucunResultat(r: Reglages): string {
  if (!r.toutesLesParties && r.parties.length === 0) {
    return 'Aucune personne n’est cochée : le fil est vide parce que le filtre ne désigne personne. '
      + 'Cochez une partie, ou relevez « Tous les mails du bien pendant la période ».';
  }
  if (!reglagesActifs(r)) return 'Aucun mail rattaché à ce bien.';
  /* 🔴 LA RECHERCHE EST NOMMÉE, ET LE MOT CHERCHÉ EST RÉPÉTÉ (lot HISTORIQUE-BIEN-2) : « aucun résultat » après
     une frappe se lit « ce bien n'a rien » tant qu'on ne relit pas son propre champ — et sur un téléphone, le
     champ est souvent sorti de l'écran. */
  if (r.texte.trim() !== '') {
    return `Aucun mail ne contient « ${r.texte.trim()} » avec ces réglages — ce sont les réglages qui cachent, pas le bien.`;
  }
  return 'Aucun mail ne correspond à ces réglages — ce sont les réglages qui cachent, pas le bien.';
}
