import { FUSEAU_AFFICHAGE } from './ecran';
/* 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — `periodeOccupation` est LA mise en forme d'une période d'occupation de
   ce dépôt (« du … au … »). La ligne d'un ancien locataire l'emploie telle quelle, jamais une copie. */
import { formaterDateIso, periodeOccupation } from './annuaireRecherche';
import type { PersonneDuMail } from './adressesMessage';
import {
  ecrireFiltres, FILTRES_VIDES, jourValide, libelleInterlocuteur, PAGE_HISTORIQUE, PORTEURS_DE_PIECES_MAX,
  type ChoixPieces, type FiltresHistorique, type Interlocuteur, type LigneHistorique,
  type MessagePorteurDePieces,
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
import { categorieDuGroupe, coteDeLaCategorie, replierLesCartes, SEUIL_REPLI_CARTES, type Categorie }
  from './partieCategorie';

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
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LES PARTIES COCHÉES DÉCIDENT SEULES ═════════════════════════════════
   *
   * Les adresses COCHÉES, en forme canonique (minuscules).
   *
   * 🔴 VIDE = **TOUS** LES MAILS DU BIEN, et c'est la nouvelle règle d'Arno (05/10/2026) : « AUCUNE partie
   * cochée → TOUS les mails rattachés au bien sur la période. AU MOINS UNE partie cochée → UNIQUEMENT les mails
   * dont l'expéditeur ou un destinataire est l'une des parties cochées. »
   *
   * 🔴 CE QUI A DISPARU, ET POURQUOI — c'est le DÉFAUT qu'Arno a constaté. Il y avait un interrupteur
   * « Tous les mails du bien sur la période », ALLUMÉ par défaut, dont la règle (lot 2) était d'IGNORER les
   * cases cochées. Cocher « Propriétaire » ne changeait donc RIEN tant qu'on ne l'avait pas relevé — et rien à
   * l'écran ne le disait. MESURÉ sur lot-290 (bien 421) : le groupe Propriétaire apparaît dans **198 mails sur
   * 326** ; Arno en voyait 326, c'est-à-dire la totalité, filtre éteint. Un interrupteur qui désarme en silence
   * les cases d'à côté est pire qu'une case qui manque : on croit avoir filtré.
   *
   * ⚠️ LA RÈGLE EST DÉSORMAIS **DÉRIVÉE**, et il n'y a donc plus d'état à tenir d'accord avec lui-même. À la
   * place, une ligne d'état dit laquelle des deux lectures on regarde (`motSelectionDesParties`).
   */
  parties: string[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — NOS ADRESSES **DÉCOCHÉES** ══════════════════════════════════════════
   *
   * DEMANDE D'ARNO : « Nouveau groupe “Notre agence” […] COCHÉES PAR DÉFAUT, décochables (“tout le groupe”
   * compris). Agence décochée → les mails écrits par nous sont retirés du listing. Le cochage par défaut de
   * l'agence ne compte PAS comme “une partie cochée” pour la règle ci-dessus. »
   *
   * 🔴 ON GARDE CE QUI EST **DÉCOCHÉ**, ET NON CE QUI EST COCHÉ. C'est ce qui rend le défaut gratuit : la liste
   * est vide quand tout est coché, l'adresse ne porte rien, et le comportement est exactement celui d'avant ce
   * lot. Garder les cochées aurait obligé l'écran à les énumérer — et une adresse de l'agence apparue depuis
   * serait née DÉCOCHÉE, l'inverse de la demande.
   *
   * 🔴 ET C'EST AUSSI CE QUI TIENT LA PHRASE « NE COMPTE PAS COMME UNE PARTIE COCHÉE » : l'agence ne vit pas
   * dans `parties`. Les deux listes ne se mélangent jamais, donc le défaut de l'une ne peut pas déclencher la
   * règle de l'autre.
   */
  agenceEcartee: string[];
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
  /* 🔴 VIDE = TOUTES NOS ADRESSES COCHÉES : le défaut d'Arno, et il ne s'écrit nulle part dans l'adresse. */
  agenceEcartee: [],
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
  /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — UNE PARTIE COCHÉE **EST** un réglage actif, et une adresse de
     l'agence décochée aussi : ce sont les deux seules façons de réduire le listing par les personnes depuis que
     l'interrupteur « Tous les mails du bien » a disparu. Sans elles, « tout remettre à plat » n'aurait pas été
     offert alors qu'il y avait quelque chose à défaire. */
  return r.periode.sorte !== 'tous' || r.parties.length > 0 || r.agenceEcartee.length > 0
    || r.pieces !== 'toutes'
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
 *
 * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — `ancien_locataire` EST EXCLU, ET CE N'EST PAS UN OUBLI. Arno ne demande
 * PAS un cinquième groupe : l'ancien locataire vit DANS l'encart Locataire, derrière son onglet « Anciens
 * locataires (N) », qui existe depuis le lot HISTORIQUE-BIEN-15. La charnière est `categorieDuGroupe`, écrite une
 * seule fois dans `partieCategorie.ts` — la catégorie porte la COULEUR, le groupe porte la PLACE.
 */
export type CleGroupeParties = Exclude<Categorie, 'ancien_locataire'>;

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
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — « NOTRE AGENCE » DEVIENT UN GROUPE, ET C'EST UN RENVERSEMENT ═══════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Nouveau groupe “Notre agence” (gris neutre, ligne dépliable sous “Non
   * affectés”) : nos adresses, avec compteurs, COCHÉES PAR DÉFAUT, décochables (“tout le groupe” compris).
   * Agence décochée → les mails écrits par nous sont retirés du listing. Le cochage par défaut de l'agence ne
   * compte PAS comme “une partie cochée”. Pas de “+”, pas de glisser-déposer pour l'agence. »
   *
   * 🔴 CE QUE CELA DÉFAIT, ET QUI ÉTAIT UNE DÉCISION D'ARNO DU LOT 2 : « notre agence n'est pas un groupe
   * sélectionnable ». Il la rouvre, et avec une règle plus fine que celle qu'il avait refusée : on ne coche pas
   * « les mails où nous sommes » (c'est-à-dire presque tous, le filtre qui n'a pas de sens), on décoche
   * « les mails que nous avons ÉCRITS ». Ce n'est pas le même filtre, et c'est pour cela qu'il est utile.
   *
   * 🔴 ELLES RESTENT HORS DES QUATRE GROUPES, et `nousEcartees` garde donc sa valeur : l'agence n'est PAS une
   * partie du bien. Les quatre autres appelants de `grouperParCategorie` ne lisent pas ce champ et ne changent
   * donc pas d'un iota — c'est la condition pour que ce renversement ne touche que le bloc d'un BIEN.
   *
   * ⚠️ UN CLIENT DU BIEN DONT L'ADRESSE EST UNE DES NÔTRES N'EST PAS ICI : il garde sa capsule dans son groupe
   * (décision d'Arno au lot 6, tenue par `clientsDuBien`). Le mettre dans « Notre agence » l'aurait fait
   * disparaître de son encart — et l'on aurait décoché un propriétaire en croyant décocher un collègue.
   */
  agence: Interlocuteur[];
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
/**
 * ══ 🔴 L'ORDRE DES QUATRE GROUPES, ÉCRIT UNE FOIS ═══════════════════════════════════════════════════════════════
 *
 * Il gouvernait déjà le rangement des parties ; depuis le lot HISTORIQUE-BIEN-14, point 2, il gouverne aussi
 * l'ordre des lignes « → envoyé à la partie … » sous une pièce que nous avons envoyée. Deux listes auraient fini
 * par se contredire sous les yeux — le propriétaire en tête d'un côté, le locataire de l'autre.
 */
export const ORDRE_DES_GROUPES: readonly CleGroupeParties[] =
  ['proprietaire', 'locataire', 'independant', 'a_repartir'];

/**
 * ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LE CINQUIÈME TON : VIOLET = ANCIEN LOCATAIRE ═══════════════════════════
 *
 * DEMANDE D'ARNO (07/10/2026) : « Applique ce violet à TOUT ce qui désigne un ancien locataire : le liseré
 * vertical des mails […], les traits de la frise […], l'encart Parties […], les groupes de pièces jointes […],
 * l'Annuaire […], le statut d'envoi des pièces jointes. »
 *
 * 🔴 CES SIX ENDROITS N'ONT PAS SIX RÈGLES : ils lisent tous la MÊME carte « adresse → catégorie », par
 * `tonDeLExpediteur` ou par `familleDeCategorie`. Ajouter la couleur ICI les sert tous, sans qu'aucun écran ne
 * sache ce qu'est un ancien locataire. C'est le « pas de copie » d'Arno, pris au mot.
 */
export type TonGroupe = 'rouge' | 'vert' | 'bleu' | 'gris' | 'violet';

/**
 * ⚠️ CE TABLEAU EST INDEXÉ PAR **CATÉGORIE**, PAS PAR GROUPE, et c'est toute la nuance de ce lot : il y a cinq
 * catégories et quatre groupes. Le violet n'a pas d'encart à lui ; il a une couleur à lui.
 */
const TONS_GROUPES: Record<Categorie, TonGroupe> = {
  proprietaire: 'rouge',
  locataire: 'vert',
  ancien_locataire: 'violet',
  independant: 'bleu',
  a_repartir: 'gris',
};

/** Le ton d'un groupe — ou d'une catégorie, le tableau les couvre toutes. PUR. */
export function tonDuGroupe(cle: Categorie): TonGroupe {
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
  const groupes = new Map<CleGroupeParties, Interlocuteur[]>(ORDRE_DES_GROUPES.map((c) => [c, []]));
  const agence: Interlocuteur[] = [];
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
    if (i.interne && !clientsDuBien.has(i.adresse.trim().toLowerCase())) {
      nousEcartees += 1;
      /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — ÉCARTÉES DES GROUPES, MAIS PLUS JETÉES : elles forment le groupe
         « Notre agence », avec leurs compteurs. Voir l'encadré de `PartiesRangees.agence`. */
      agence.push(i);
      continue;
    }
    /* ⚠️ LA CLÉ EST NORMALISÉE DES DEUX CÔTÉS : « Jean.PONS@… » et « jean.pons@… » sont la même personne, et une
       comparaison sensible à la casse l'aurait rangée « non affectée » alors que l'annuaire la connaît. */
    /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — `categorieDuGroupe` RAMÈNE L'ANCIEN LOCATAIRE DANS L'ENCART LOCATAIRE.
       Sa capsule y est, violette ; son onglet « Anciens locataires (N) » la montre. Un cinquième groupe aurait
       déplacé toutes les cases à cocher de l'encart — et Arno ne l'a pas demandé. */
    const cle = categorieDuGroupe(categories.get(i.adresse.trim().toLowerCase()) ?? 'a_repartir');
    groupes.get(cle)?.push(i);
  }
  return {
    groupes: ORDRE_DES_GROUPES.map((cle) => {
      const liste = groupes.get(cle) ?? [];
      return {
        cle, titre: TITRES_GROUPES[cle], ton: TONS_GROUPES[cle], interlocuteurs: liste, nb: liste.length,
      };
    }),
    nousEcartees,
    /* ⚠️ L'ORDRE EST CELUI REÇU, comme pour les quatre groupes : la route rend déjà du plus bavard au moins
       bavard, et un second tri aurait donné deux vérités sur « qui parle le plus ». */
    agence,
  };
}

/**
 * ══ 🔴 LE TITRE DU GROUPE « NOTRE AGENCE » ══════════════════════════════════════════════════════════════════════
 *
 * 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — CE QUE CETTE FONCTION DISAIT A CESSÉ D'ÊTRE VRAI. Elle écrivait
 * « N adresses de notre agence ne sont pas listées : nos mails apparaissent dès qu'ils font partie d'un échange
 * avec une partie sélectionnée. » Or elles SONT listées maintenant — Arno en a fait un groupe. Garder la phrase
 * aurait affiché, juste au-dessus du groupe, l'affirmation qu'il n'existe pas.
 *
 * Ce qu'elle promettait n'est pas perdu pour autant, et c'est même dit plus précisément : la ligne d'état
 * (`motSelectionDesParties`) explique laquelle des deux lectures on regarde, et le groupe lui-même montre ses
 * adresses avec leurs compteurs. Une information affichée vaut mieux qu'une information racontée.
 *
 * ⚠️ `null` QUAND NOUS N'AVONS JAMAIS ÉCRIT : pas de groupe vide sur un bien qui n'en a pas l'usage — c'est la
 * règle de tous les autres groupes de ce bloc.
 */
export const TITRE_GROUPE_AGENCE = 'Notre agence';

export function motGroupeAgence(nb: number): string | null {
  if (nb <= 0) return null;
  return nb === 1
    ? 'Notre agence : 1 adresse. Décochez-la pour retirer du listing les mails que nous avons écrits.'
    : `Notre agence : ${nb} adresses. Décochez-les pour retirer du listing les mails que nous avons écrits.`;
}

/**
 * ══ 🔴🔴 LA LIGNE D'ÉTAT DU FILTRE — « laquelle des deux lectures je regarde » ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « La case “Tous les mails du bien sur la période” est remplacée par
 * cette règle automatique : à sa place, une ligne d'état claire, “Aucune partie cochée : tous les mails du bien
 * sont affichés” ou “N parties cochées : seuls leurs échanges sont affichés”, avec un bouton “Tout décocher”. »
 *
 * 🔴 C'EST LA RÉPARATION DU DÉFAUT, ET NON UNE DÉCORATION. L'ancien interrupteur désarmait les cases d'à côté
 * SANS RIEN DIRE : on cochait « Propriétaire », les 326 mails du bien restaient, et rien à l'écran n'expliquait
 * pourquoi. Une règle automatique sans ligne d'état aurait le défaut inverse — on ne saurait plus pourquoi le
 * listing a changé. La phrase dit donc toujours, en toutes lettres, ce que le filtre fait.
 *
 * ⚠️ L'AGENCE N'EST PAS COMPTÉE DANS « N PARTIES COCHÉES » : elle est cochée par défaut, et la compter aurait
 * fait lire « 4 parties cochées » sur un écran où personne n'a rien coché. C'est la demande d'Arno, et c'est
 * aussi ce que le modèle garantit : l'agence ne vit pas dans `parties`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const MOT_TOUT_DECOCHER = 'Tout décocher';

export function motSelectionDesParties(nbCochees: number, nbMails?: number): string {
  const phrase = nbCochees <= 0
    ? 'Aucune partie cochée : tous les mails du bien sont affichés.'
    : nbCochees === 1
      ? '1 partie cochée : seuls ses échanges sont affichés.'
      : `${nbCochees} parties cochées : seuls leurs échanges sont affichés.`;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 4 — LE COMPTE, À LA SUITE DE LA PHRASE ════════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « À la suite du message […] ajoute le nombre de mails affichés : “— 326
   * mails”. Il se met à jour en direct à chaque case cochée ou décochée, à chaque changement de période,
   * d'options ou de recherche. C'est le MÊME nombre que celui du listing (même calcul), même au-delà des 100
   * mails chargés. »
   *
   * 🔴 IL EST DANS LA MÊME FONCTION QUE LA PHRASE, et non collé par l'écran : les deux disent une seule chose —
   * « voilà ce que vous regardez, et voilà combien ça fait ». Deux morceaux assemblés au rendu auraient fini par
   * se désaccorder, l'un parlant de la sélection et l'autre de la page chargée.
   *
   * ⚠️ `undefined` ⇒ LA PHRASE SEULE, et c'est le cas tant que la première réponse n'est pas revenue. Écrire
   * « — 0 mail » pendant le chargement aurait annoncé un bien vide une fraction de seconde, à chaque ouverture.
   */
  if (nbMails === undefined) return phrase;
  return `${phrase} — ${nbMails} mail${nbMails > 1 ? 's' : ''}`;
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
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — LE MOT D'UN TON, POUR L'INFO-BULLE D'UNE ADRESSE ══════════════════════
 *
 * DEMANDE D'ARNO : « Chaque adresse porte la petite pastille de couleur de sa catégorie […] avec une info-bulle
 * sur la catégorie. »
 *
 * 🔴 IL VIENT DE LA LÉGENDE, ET DE NULLE PART AILLEURS. La légende sous le listing et l'info-bulle d'une adresse
 * doivent dire LE MÊME MOT pour LA MÊME couleur — sinon on lit « bleu = tiers indépendant » sous le fil, et
 * « bleu = prestataire » dans une info-bulle, et l'on croit à deux notions.
 *
 * ⚠️ UN TON INCONNU REND SON PROPRE NOM plutôt que de lever : une info-bulle est une commodité, et faire tomber
 * un mail déplié pour un mot manquant serait hors de proportion.
 */
export function motTonDeMail(ton: TonMail): string {
  return LEGENDE_BARRES.find((x) => x.ton === ton)?.mot ?? ton;
}

export const LEGENDE_BARRES: readonly { ton: TonMail; mot: string }[] = [
  { ton: 'rouge', mot: 'propriétaire' },
  { ton: 'vert', mot: 'locataire' },
  /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — le violet entre dans la légende À CÔTÉ du vert, parce que c'est là qu'on
     le cherche : les deux parlent du logement, et c'est leur VOISINAGE qui fait comprendre la distinction. Une
     couleur de plus sans ligne de légende serait une couleur qu'on devine — et qu'on devine mal. */
  { ton: 'violet', mot: 'ancien locataire' },
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
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 2 — L'ORDRE DES LIGNES SOUS LES ENCARTS ═══════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Tiers indépendant, puis Notre agence, puis Non affectés en
 * DERNIER. »
 *
 * 🔴 L'AGENCE EST **ENTRE** LES DEUX, ET C'EST POUR CELA QUE CETTE LISTE EXISTE. `GROUPES_EN_BANDE` ne porte que
 * des CATÉGORIES, et l'agence n'en est pas une (ni « + », ni glisser, ni rangement — lot 9). L'écran aurait donc
 * dû intercaler la bande à la main, c'est-à-dire décider d'un ordre que ce module existe pour tenir. La liste
 * ci-dessous dit l'ordre COMPLET, agence comprise, et l'écran se contente de la parcourir.
 *
 * ⚠️ `GROUPES_EN_BANDE` RESTE, et il n'est pas un doublon : il répond à « quelles CATÉGORIES se rendent en
 * bande ? » (c'est lui que le garde de couverture des quatre groupes additionne à `GROUPES_EN_ENCART`). Celle-ci
 * répond à « dans quel ORDRE les lignes s'empilent-elles ? ». Deux questions, deux listes — et la seconde se lit
 * comme la capture d'Arno.
 */
export const BANDES_SOUS_LES_ENCARTS: readonly (CleGroupeParties | 'agence')[] =
  ['independant', 'agence', 'a_repartir'];

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
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — LES CONTACTS DE LA LOCATION REGARDÉE, AVEC LEURS COMPTEURS ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI IL FAUT LES **AJOUTER**, ET PAS SEULEMENT FILTRER. Choisir un ancien locataire règle la période sur
 * son occupation ; or ses contacts annexes écrivent souvent APRÈS son départ — c'est tout le cas d'Arno, un dépôt
 * de garantie réglé onze mois plus tard. Ces adresses sont donc ABSENTES de la liste que la route rend sur cette
 * période : un filtre, si juste soit-il, n'aurait rien eu à garder. Elles sont posées ici.
 *
 * 🔴 LEURS COMPTEURS SONT CEUX DES MAILS **PARTAGÉS** AVEC LA CARTE, et c'est la seule arithmétique honnête : les
 * compter sur la période en vigueur aurait affiché « a écrit : 0 · en copie : 0 » sous une capsule bien présente.
 * On montre ce qui JUSTIFIE la présence.
 *
 * ⚠️ UNE ADRESSE DÉJÀ LÀ EST **RÉÉCRITE**, pas doublée : la route l'a peut-être comptée sur la période, et deux
 * capsules de la même personne avec deux nombres différents est pire que l'absence. Une seule vérité par adresse.
 *
 * ⚠️ RIEN POUR LE LOCATAIRE EN PLACE QUAND LA PÉRIODE EST LIBRE ? Si : la règle est la même pour lui. Sa carte
 * réclame ses contacts comme une autre, et c'est ce qui empêche ceux d'un ancien de venir chez lui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function completerAvecLesContactsDuLocataire(
  interlocuteurs: readonly Interlocuteur[],
  contacts: readonly ContactDeLocataire[],
  cartes: readonly CarteLocataireBien[],
  choix: ChoixLocataire,
): Interlocuteur[] {
  const choisies = choix.sorte === 'en_place'
    ? cartes.filter((c) => c.enPlace).map((c) => c.cle)
    : [choix.cle];
  if (choisies.length === 0) return [...interlocuteurs];
  /* ⚠️ LE PLUS FOURNI GAGNE quand deux cartes choisies réclament la même adresse (un couple en place, deux
     cartes) : c'est le compte le plus complet des mails partagés, et non le premier rencontré. */
  const par = new Map<string, ContactDeLocataire>();
  for (const c of contacts) {
    if (!choisies.includes(c.cle)) continue;
    const a = c.adresse.trim().toLowerCase();
    if (a === '') continue;
    const vu = par.get(a);
    if (vu === undefined || c.nbMails > vu.nbMails) par.set(a, c);
  }
  const out = interlocuteurs.map((i) => {
    const c = par.get(i.adresse.trim().toLowerCase());
    return c === undefined ? i
      : { ...i, nbMails: c.nbMails, aEcrit: c.aEcrit, enCopie: c.enCopie };
  });
  const deja = new Set(interlocuteurs.map((i) => i.adresse.trim().toLowerCase()));
  for (const [a, c] of par) {
    if (deja.has(a)) continue;
    out.push({
      adresse: c.adresse, nom: c.nom, nbMails: c.nbMails, aEcrit: c.aEcrit, enCopie: c.enCopie, interne: false,
    });
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

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 4 — L'ORDRE DES CAPSULES DANS UN GROUPE. PUR. ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026), mot pour mot : « D'abord les CLIENTS, triés par “a écrit” décroissant ; puis les
 * CONTACTS, triés par “a écrit” décroissant ; à égalité, par “en copie” décroissant, puis par nom. L'ordre se
 * recalcule quand la période change. »
 *
 * 🔴 POURQUOI LES CLIENTS D'ABORD, ET POURQUOI CE N'ÉTAIT PAS LE CAS. Jusqu'ici l'ordre était celui du dépôt —
 * du plus bavard au moins bavard, clients et contacts mêlés. Sur un bien où le secrétariat du propriétaire écrit
 * plus que le propriétaire (le cas du lot 29 : 9 mails contre 33, mais sur bien d'autres l'inverse), le CLIENT
 * se retrouvait sous ses propres contacts. Or c'est lui qu'on vient voir : un encart « Propriétaire » doit
 * commencer par le propriétaire.
 *
 * 🔴 ET LE TRI SE RECALCULE AVEC LA PÉRIODE SANS RIEN DE PLUS, parce qu'il lit `aEcrit` et `enCopie` — deux
 * compteurs que la route calcule SUR LA PÉRIODE DEMANDÉE. Changer les bornes change les compteurs, donc l'ordre.
 * C'est la raison pour laquelle le tri est ici et non en SQL : en base, il aurait fallu le refaire à chaque
 * borne, et l'écran aurait pu afficher un ordre calculé sur une autre période que celle qu'il montre.
 *
 * ⚠️ LA SORTE EST LUE PAR `sorteDeCapsule`, ET PAR ELLE SEULE : c'est la même fonction qui décide de la pastille
 * et du glisser. Un second test « est-ce un client ? » écrit ici aurait fini par classer un propriétaire parmi
 * les contacts — et il serait passé sous eux, c'est-à-dire exactement le défaut qu'on corrige.
 *
 * ⚠️ L'AGENCE ET LES TIERS SONT TRIÉS AVEC LES CONTACTS, et c'est sans conséquence : l'agence n'est pas listée
 * (règle du lot 2, sauf un client interne — qui est alors un CLIENT, donc en tête), et un groupe « Tiers
 * indépendant » ne contient que des tiers. Leur donner un rang à part aurait été une règle pour un ensemble
 * vide.
 *
 * ⚠️ LE TRI EST STABLE PAR CONSTRUCTION : à égalité parfaite sur les trois critères, l'ordre reçu est conservé
 * (`Array.prototype.sort` l'est depuis ES2019). Deux capsules identiques ne sautent donc pas d'un rendu à
 * l'autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ordonnerLesCapsules(
  interlocuteurs: readonly Interlocuteur[],
  groupe: CleGroupeParties,
  categoriesFiche: ReadonlyMap<string, CategoriePartie>,
): Interlocuteur[] {
  /** 0 pour un client, 1 pour tout le reste : c'est le premier critère, et il n'a que deux valeurs. */
  const rang = (i: Interlocuteur): number =>
    sorteDeCapsule(i.adresse, groupe, categoriesFiche, i.interne) === 'client' ? 0 : 1;

  return [...interlocuteurs].sort((a, b) => {
    const r = rang(a) - rang(b);
    if (r !== 0) return r;
    /* « a écrit » décroissant — le critère d'Arno, et le plus parlant : qui a pris la plume. */
    if (b.aEcrit !== a.aEcrit) return b.aEcrit - a.aEcrit;
    /* puis « en copie » décroissant : à défaut d'avoir écrit, qui a été mis dans la boucle. */
    if (b.enCopie !== a.enCopie) return b.enCopie - a.enCopie;
    /**
     * puis le NOM, et c'est lui qui rend l'ordre reproductible d'un rendu à l'autre.
     *
     * ⚠️ ON COMPARE CE QUI S'AFFICHE (`libelleInterlocuteur`), et non `nom ?? adresse` écrit à la main : une
     * capsule sans nom montre son adresse, et trier sur un nom vide l'aurait mise au hasard parmi les autres.
     * `localeCompare` range « Élodie » avec les E, ce qu'un `<` ne fait pas.
     */
    return libelleInterlocuteur(a).localeCompare(libelleInterlocuteur(b), 'fr');
  });
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

/**
 * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 1 — COMBIEN DE CAPSULES UN ENCART MONTRE ══════════════════════
 *
 * Trois, c'est le nombre d'origine (demande d'Arno au lot HISTORIQUE-BIEN-3 : « la hauteur actuelle, 3 lignes
 * visibles »). Il était écrit dans la FEUILLE, sous forme d'une hauteur en rem calculée à la main — et c'est de là
 * que venait le faux « ↓ 1 autre » : une capsule dont le nom passe à la ligne dépassait la hauteur supposée.
 *
 * 🔴 IL EST DÉSORMAIS UN NOMBRE DE LIGNES, et la hauteur se MESURE (`hauteurDesPremiers`). C'est la seule façon
 * de tenir la promesse « ces trois-là tiennent entièrement », quelle que soit la hauteur réelle d'une capsule.
 */
export const CAPSULES_VISIBLES = 3;

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
 * ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — **LA** RÈGLE « ANCIEN LOCATAIRE OU LOCATAIRE ACTUEL ». PURE. ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « Une SEULE règle décide “ancien locataire vs locataire actuel” (celle de l'encart
 * Parties : date de départ), réutilisée par tous ces endroits. Pas de copie. »
 *
 * 🔴 ELLE EXISTAIT, ÉCRITE SIX FOIS, EN SIX `o.sortie === null` ÉPARPILLÉS : le dépôt (`encours`), la fiche du
 * bien (`actuels` / `passes`), les cartes de l'encart Parties (`enPlace`), la capsule de l'Annuaire, le bloc
 * « Historique des locataires », et la carte des catégories. Six écritures de la même phrase, qu'aucun compilateur
 * ne pouvait rapprocher. Elle n'est plus écrite qu'ici, et les six l'appellent.
 *
 * 🔴 LA RÈGLE EST « UNE DATE DE DÉPART EST RENSEIGNÉE », mot pour mot celle de l'encart Parties — et non « le bail
 * court-il AUJOURD'HUI ». La nuance porte, et elle a été MESURÉE le 07/10/2026 : **4 occupations sur 535 portent
 * une date de sortie à VENIR**. L'encart Parties les range déjà parmi les anciens (un préavis déposé est un
 * départ acté), et ce lot ne déplace personne — Arno demande une couleur, pas un reclassement.
 *
 * ⚠️ ELLE N'EST **PAS** `occupationOuverte`, juste au-dessus, et les confondre serait un contresens. Celle-là
 * répond à « le bail couvrait-il CE JOUR-LÀ ? » — c'est la question d'un FILTRE de période, qui doit dire vrai
 * pour une date de 2023. Celle-ci répond à « cette personne est-elle encore notre locataire ? » — c'est la
 * question d'une COULEUR et d'un BLOC. Deux questions, deux fonctions, et le commentaire de chacune dit laquelle.
 *
 * ⚠️ UNE DATE ABÎMÉE EST UNE DATE : `sortie` renseignée mais illisible veut dire « il y a eu un départ », et la
 * lire comme absente aurait écrit « en place » sur la foi d'une donnée cassée. Même convention qu'`occupationOuverte`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function estAncienLocataire(o: { sortie: string | null }): boolean {
  return (o.sortie ?? '').trim() !== '';
}

/** L'autre face de la MÊME règle, pour que personne n'ait à écrire `!estAncienLocataire(...)`. PURE. */
export function estLocataireEnPlace(o: { sortie: string | null }): boolean {
  return !estAncienLocataire(o);
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
      /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — l'interrupteur n'existe plus ; nos adresses décochées, elles,
         voyagent comme les parties (même forme, même borne). */
      agenceEcartee: Array.isArray(r.agenceEcartee)
        ? r.agenceEcartee.filter((x): x is string => typeof x === 'string').slice(0, 200)
        : [],
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
 * ⚠️ AUCUNE PARTIE COCHÉE ⇒ **AUCUN** `avec` : la liste vide se lit « tous les mails du bien », et c'est la
 * règle d'Arno du lot 9. L'ancien interrupteur « Tous les mails du bien », qui ignorait les cases cochées sans
 * les effacer, a disparu — voir l'encadré de `Reglages.parties`.
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
    interlocuteurs: [...new Set(r.parties.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))],
    /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — nos adresses DÉCOCHÉES deviennent des expéditeurs écartés. La route
       retire alors les mails que NOUS avons écrits, et eux seuls (voir `FiltresHistorique.expediteursExclus`). */
    expediteursExclus: [...new Set(r.agenceEcartee.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))],
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
   ⑥-bis 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — UN SEUL LOCATAIRE À LA FOIS DANS L'ENCART
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CONSTAT D'ARNO (05/10/2026, lot-146) : « L'encart affiche “Locataire 6” : il mêle le locataire en place
   (BRASSET Mathilde et BRUERE Thomas) et les adresses des anciens (VAGLIO ARNAUD, ACKET GOEMAERE - DERRIEN). »

   🔴 MESURÉ EN BASE, ET IL A RAISON À L'UNITÉ. Le bien 104 (fiche lot-146) porte TROIS occupations, deux adresses
   chacune — 2 + 2 + 2 = les 6 capsules qu'il voit :

       BRASSET Mathilde et BRUERE Thomas            depuis le 22/10/2025   (en place)
       VAGLIO ARNAUD Aurélie et Louis               du 06/02/2025 au 22/10/2025
       ACKET GOEMAERE - DERRIEN Alizée et Thomas    du 01/04/2022 au 31/01/2025

   🔴 SA RÈGLE : « Jamais deux périodes de locataires dans la même recherche. » Par défaut le locataire EN PLACE
   seul ; les anciens se choisissent UN PAR UN, et ce choix REMPLACE le locataire en place.

   ⚠️ CE MODULE NE DÉCIDE PAS DE L'ÉCRAN, IL DÉCIDE DE L'ENSEMBLE D'ADRESSES. L'encart, la ligne dépliable et les
   boutons radio sont du rendu ; ce qui doit être écrit UNE FOIS, c'est « quelles adresses appartiennent au
   locataire choisi » — parce que c'est cet ensemble que le listing, le compteur et le résumé des pièces lisent.
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * UNE CARTE DE LOCATAIRE DU BIEN : une occupation, avec son nom, ses dates et ses adresses.
 *
 * 🔴 UNE PAR OCCUPATION, ET NON PAR PERSONNE. « Une même personne peut avoir occupé deux fois le même logement »
 * (encadré d'`OccupationDuLot`) : deux séjours sont deux périodes, et les confondre remettrait le mélange qu'on
 * vient de défaire. La clé est donc celle de l'OCCUPATION.
 */
export interface CarteLocataireBien {
  /** Clé stable de l'occupation (`occ-92`). C'est elle que le bouton radio porte. */
  cle: string;
  /** Le NOM de la carte, tel que la fiche l'écrit. Jamais recomposé ici. */
  libelle: string;
  depuis: string | null;
  jusqua: string | null;
  /** Vrai quand le bail court toujours : c'est LE locataire en place, celui du défaut. */
  enPlace: boolean;
  /** Ses adresses, en forme canonique (minuscules). Une capsule par adresse à l'écran. */
  adresses: readonly string[];
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — UN CONTACT ANNEXE, ET LA LOCATION QUI LE RÉCLAME ══════════════════════
 *
 * ⚠️ LA FORME EST REDITE ICI, ET NON IMPORTÉE DU DÉPÔT : ce module est atteint par le navigateur, et importer
 * `historiqueRepo` y tirerait `pg`. C'est la règle du garde de frontière, et c'est déjà ce que font
 * `Interlocuteur` et `LigneHistorique`. La route rend exactement cette forme.
 */
export interface ContactDeLocataire {
  /** La clé de la carte de locataire, dans la forme de l'écran : `occ-<id d'occupation>`. */
  cle: string;
  adresse: string;
  nom: string | null;
  /** Compteurs sur les mails PARTAGÉS avec cette carte — voir `contactsParLocataire`. */
  aEcrit: number;
  enCopie: number;
  nbMails: number;
}

/** Ce que l'encart montre : le locataire en place, ou la carte d'un ancien. */
export type ChoixLocataire = { sorte: 'en_place' } | { sorte: 'ancien'; cle: string };

export const CHOIX_LOCATAIRE_DEFAUT: ChoixLocataire = { sorte: 'en_place' };

/** Le libellé de l'option qui ramène au défaut. */
export const MOT_LOCATAIRE_EN_PLACE = 'Locataire en place';

/**
 * Le titre de la ligne dépliable. Il DIT COMBIEN, pour qu'on sache qu'il y a quelque chose dessous sans cliquer.
 *
 * ⚠️ RIEN À AFFICHER QUAND IL N'Y A AUCUN ANCIEN : l'appelant ne rend alors pas la ligne. Un « Anciens locataires
 * (0) » dépliable sur du vide est une porte qui ne mène nulle part.
 */
export function motAnciensLocataires(n: number): string {
  return `Anciens locataires (${n})`;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — LES DEUX BOUTONS DE L'EN-TÊTE DE L'ENCART LOCATAIRE ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « L'en-tête de l'encart porte DEUX boutons côte à côte, sur la même ligne, à la
 * place du titre actuel "▼ Locataire 2" : "Locataire(s) actuel(s) 2" puis "Anciens locataires (2)". […] L'en-tête
 * affiche alors en noir le nom de la catégorie choisie ("Anciens locataires · VAGLIO ARNAUD Aurélie et Louis"). »
 *
 * 🔴 CES MOTS SONT CEUX D'ARNO, AU CARACTÈRE PRÈS, Y COMPRIS LES PARENTHÈSES DE « Locataire(s) actuel(s) ». Elles
 * ne sont pas une coquetterie : un logement peut avoir UN occupant ou un COUPLE, et le même bouton sert les deux.
 * Écrire « Locataire actuel » aurait menti une fois sur deux sur les biens de ce portefeuille.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const MOT_LOCATAIRES_ACTUELS = 'Locataire(s) actuel(s)';

/**
 * ══ 🔴🔴 CE QUE DIT LE BOUTON « ANCIENS LOCATAIRES » ═════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MOT A CHANGÉ AU LOT HISTORIQUE-BIEN-16, POINT 2, ET VOICI POURQUOI. Au lot 15 il devenait
 * « Anciens locataires · VAGLIO ARNAUD Aurélie et Louis » dès qu'une carte était choisie. Arno l'a vu à l'écran
 * et tranche : « le bouton reste "Anciens locataires (2)", simplement écrit en noir. On n'ajoute PLUS le nom de
 * la carte, qui fait DOUBLON avec les capsules affichées dessous. »
 *
 * 🔴 ET IL A DEUX FOIS RAISON. Le doublon d'abord : les capsules qui s'affichent SOUS le bouton portent déjà le
 * nom et les dates du locataire regardé. La mise en page ensuite : un libellé qui s'allonge au clic faisait
 * passer l'en-tête de une à deux lignes, donc déplaçait la case « tout le groupe » et décalait tout l'encart
 * sous le curseur — au moment précis où l'on vient de cliquer.
 *
 * 🔴 CE QUI EST PERDU NE L'EST PAS : le nom de la carte choisie reste à l'écran, en INFO-BULLE du bouton
 * (`aideBoutonAnciensLocataires`). Rien ne disparaît, tout change de place — et le compte, lui, reste lisible
 * en permanence, ce qu'il n'était plus dès qu'une carte était choisie.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function motBoutonAnciensLocataires(n: number): string {
  return motAnciensLocataires(n);
}

/**
 * ══ 🔴 L'INFO-BULLE DU BOUTON — QUELLE CARTE EST AFFICHÉE ═══════════════════════════════════════════════════════
 *
 * Arno : « Pour savoir quelle carte est choisie, une info-bulle sur le bouton suffit ("Ancien locataire
 * affiché : …"). »
 *
 * ⚠️ `undefined` QUAND AUCUNE CARTE N'EST CHOISIE : le bouton n'a alors rien de particulier à dire, et une
 * info-bulle qui répèterait son propre libellé apprend à ne plus la lire.
 */
export function aideBoutonAnciensLocataires(choisie: CarteLocataireBien | undefined): string | undefined {
  return choisie === undefined ? undefined : `Ancien locataire affiché : ${choisie.libelle}`;
}

/**
 * ══ 🔴 POURQUOI UN BOUTON DE L'EN-TÊTE EST INACTIF, DIT EN TOUTES LETTRES ════════════════════════════════════════
 *
 * Arno : « lot-290 (aucun ancien : bouton "Anciens locataires (0)" grisé et inactif, avec une info-bulle) ».
 *
 * 🔴 GRISÉ ET NON MASQUÉ, et c'est la même règle que la case « tout le groupe » d'un groupe vide (lot 5, point 2) :
 * un bouton qui disparaît fait changer l'en-tête de forme d'un bien à l'autre, et l'autre bouton se déplace sous
 * le curseur. Un bouton grisé DIT qu'il n'y a rien là-dessous, ce qui est une information.
 *
 * ⚠️ LA SYMÉTRIE EST VOULUE : sur un logement VACANT, c'est « Locataire(s) actuel(s) » qui ne désigne personne, et
 * il est grisé pour exactement la même raison. Le cliquer aurait vidé l'encart d'un bien qui porte des années
 * d'échanges — un masquage, que le dépôt interdit.
 */
export const AIDE_SANS_LOCATAIRE_ACTUEL = 'Ce logement n’a aucun locataire en place.';
export const AIDE_SANS_ANCIEN_LOCATAIRE = 'Ce logement n’a aucun ancien locataire connu.';

/**
 * ══ 🔴 LE MOT D'UNE LIGNE D'ANCIEN LOCATAIRE. PUR. ══════════════════════════════════════════════════════════════
 *
 * Arno : « une ligne par CARTE d'ancien locataire (nom de la carte + période “du … au …” + nombre d'adresses) ».
 *
 * 🔴 LA PÉRIODE EST ÉCRITE PAR `periodeOccupation`, LA FONCTION DES FICHES — importée, pas recopiée. « du … au
 * … », « depuis le … », « jusqu'au … », « dates inconnues » : la ligne de l'ancien locataire dit donc la période
 * EXACTEMENT comme la fiche du bien l'écrit trois blocs plus haut. Une seconde mise en forme des dates aurait
 * fini par dire autrement la même période, et cet écart-là se recopie dans un courrier.
 */
export function motAncienLocataire(c: CarteLocataireBien): string {
  const n = c.adresses.length;
  const combien = n === 0 ? 'aucune adresse' : `${n} adresse${n > 1 ? 's' : ''}`;
  return `${c.libelle} · ${periodeOccupation(c.depuis, c.jusqua)} · ${combien}`;
}

/** Les cartes EN PLACE, dans l'ordre reçu. Plusieurs sont possibles (deux occupants d'un même bail). PUR. */
export function locatairesEnPlace(cartes: readonly CarteLocataireBien[]): CarteLocataireBien[] {
  return cartes.filter((c) => c.enPlace);
}

/**
 * LES ANCIENS, DU PLUS RÉCENT AU PLUS ANCIEN. PUR.
 *
 * 🔴 TRIÉS SUR LA SORTIE, ET L'ÉGALITÉ TRANCHÉE PAR L'ENTRÉE : c'est l'ordre dans lequel on les a en tête, et il
 * doit être TOTAL — deux baux clos le même jour donneraient sinon un ordre qui change d'un affichage à l'autre.
 *
 * ⚠️ UNE DATE INCONNUE PASSE EN DERNIER, jamais en tête : on ne met pas en avant ce qu'on ne sait pas situer.
 */
export function anciensLocataires(cartes: readonly CarteLocataireBien[]): CarteLocataireBien[] {
  return cartes.filter((c) => !c.enPlace)
    .sort((a, b) => parDepartLePlusRecent(
      { sortie: a.jusqua, entree: a.depuis, nom: a.libelle },
      { sortie: b.jusqua, entree: b.depuis, nom: b.libelle }));
}

/**
 * ══ 🔴🔴 L'ORDRE DES ANCIENS LOCATAIRES — DU PLUS RÉCEMMENT PARTI AU PLUS ANCIEN. PUR. ═══════════════════════════
 *
 * 🔴 EXTRAIT AU LOT ANCIENS-LOCATAIRES-VIOLET, et le mot « extrait » compte : ce comparateur vivait DANS
 * `anciensLocataires`, qui ne sait trier que des cartes de l'encart Parties. La fiche du bien doit ranger ses
 * RANGÉES d'anciens locataires dans le même ordre (Arno : « du plus récent au plus ancien ») — le recopier aurait
 * donné deux ordres pour la même liste, et l'écart ne se serait vu que sur un bien à trois anciens.
 *
 * ⚠️ IL EST TOTAL : la sortie, puis l'entrée, puis le nom. Deux baux clos le même jour donneraient sinon un ordre
 * qui change d'un affichage à l'autre.
 * ⚠️ UNE DATE INCONNUE PASSE EN DERNIER, jamais en tête : on ne met pas en avant ce qu'on ne sait pas situer.
 */
export function parDepartLePlusRecent(
  a: { sortie: string | null; entree: string | null; nom: string },
  b: { sortie: string | null; entree: string | null; nom: string },
): number {
  const rang = (x: string | null): number => {
    const t = Date.parse(`${(x ?? '').slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return (rang(b.sortie) - rang(a.sortie)) || (rang(b.entree) - rang(a.entree)) || a.nom.localeCompare(b.nom, 'fr');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — ACTUELS ET ANCIENS NE SE COCHENT JAMAIS ENSEMBLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Lequel des deux groupes de locataires un geste vient de décocher. `null` = aucun, rien n'a bougé. */
export type FamilleDecochee = 'actuels' | 'anciens';

/**
 * ══ 🔴 LE MOT DISCRET SOUS L'ENCART, QUAND LA BASCULE A LIEU. PUR. ═══════════════════════════════════════════════
 *
 * Arno : « Petite mention discrète sous l'encart quand la bascule a lieu, par exemple “Locataires actuels
 * décochés : on n'affiche pas actuels et anciens ensemble”. Elle disparaît d'elle-même. »
 *
 * 🔴 ELLE DIT CE QUI VIENT D'ÊTRE FAIT, ET POURQUOI. Un décochage silencieux se lit comme une case qui n'a pas
 * pris : on recoche, et l'autre se décoche à son tour — on croit l'écran cassé. La phrase ferme cette boucle.
 */
export function motBasculeLocataires(quoi: FamilleDecochee): string {
  return quoi === 'actuels'
    ? 'Locataires actuels décochés : on n’affiche pas actuels et anciens ensemble.'
    : 'Anciens locataires décochés : on n’affiche pas actuels et anciens ensemble.';
}

/** Combien de temps la mention reste. Le même rythme que les autres messages passagers du module. */
export const MS_MENTION_BASCULE = 6000;

/**
 * Les adresses d'un bien, rangées en deux camps par la règle unique (`enPlace` d'une carte de locataire). PURE.
 *
 * ⚠️ UNE ADRESSE QUI N'EST SUR AUCUNE CARTE N'EST DANS AUCUN CAMP, et c'est tout l'intérêt de passer par les
 * cartes plutôt que par les catégories : le contact annexe d'une location (la sœur du locataire, un service
 * « relations publiques ») est rangé « locataire » SANS appartenir à une occupation. Le décocher au passage
 * aurait retiré, sans le dire, une case que la personne venait de cocher.
 *
 * ⚠️ UNE ADRESSE PRÉSENTE DES DEUX CÔTÉS (quelqu'un qui est revenu dans le logement) COMPTE COMME ACTUELLE : le
 * présent l'emporte, et c'est la lecture qu'on fait du mot « locataire » sans y réfléchir.
 */
export function campsDesLocataires(
  cartes: readonly CarteLocataireBien[],
): { actuels: ReadonlySet<string>; anciens: ReadonlySet<string> } {
  const actuels = new Set<string>();
  const anciens = new Set<string>();
  for (const c of cartes) {
    for (const a of c.adresses) (c.enPlace ? actuels : anciens).add(a.trim().toLowerCase());
  }
  for (const a of actuels) anciens.delete(a);
  return { actuels, anciens };
}

/**
 * ══ 🔴🔴 L'EXCLUSIVITÉ ENTRE LES DEUX CAMPS. PURE. ═══════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (07/10/2026) : « Dans la sélection des parties, les locataires actuels et les anciens locataires
 * ne peuvent JAMAIS être cochés en même temps. Cocher un ancien locataire (ou “tout le groupe” de l'onglet
 * Anciens) décoche automatiquement tous les locataires actuels, et inversement. Plusieurs anciens locataires
 * peuvent être cochés ensemble, et plusieurs locataires actuels aussi : l'exclusivité est entre les deux
 * groupes. Les autres groupes restent cumulables avec l'un OU l'autre. »
 *
 * 🔴 ELLE REGARDE CE QUE LE GESTE **AJOUTE**, et rien d'autre. C'est le seul endroit où l'intention se lit sans
 * ambiguïté : décocher ne bascule rien (on n'a pas demandé l'autre camp), et cocher dit lequel on veut. Une
 * règle qui aurait regardé l'état FINAL aurait dû choisir un camp au hasard quand les deux s'y trouvent.
 *
 * 🔴 ET ELLE NE TOUCHE QUE LES DEUX CAMPS. Propriétaire, Tiers indépendant, Notre agence, Non affectés et les
 * contacts annexes d'une location traversent intacts — Arno le demande en toutes lettres, et c'est ce qui permet
 * de regarder « le propriétaire ET l'ancienne locataire » d'un même œil.
 *
 * ⚠️ UN GESTE QUI AJOUTE LES DEUX CAMPS À LA FOIS N'EXISTE PAS À L'ÉCRAN (l'encart ne montre qu'un camp à la
 * fois), mais la fonction doit quand même trancher : l'ANCIEN l'emporte, parce que c'est le camp qu'on va
 * CHERCHER — on ne clique pas « Anciens locataires » par hasard, alors que les actuels sont le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function exclusiviteLocataires(
  avant: readonly string[],
  apres: readonly string[],
  cartes: readonly CarteLocataireBien[],
): { parties: string[]; decoche: FamilleDecochee | null } {
  const { actuels, anciens } = campsDesLocataires(cartes);
  const deja = new Set(avant.map((a) => a.trim().toLowerCase()));
  const ajoutees = apres.map((a) => a.trim().toLowerCase()).filter((a) => !deja.has(a));
  const ajouteAncien = ajoutees.some((a) => anciens.has(a));
  const ajouteActuel = ajoutees.some((a) => actuels.has(a));
  /* ⚠️ L'ANCIEN D'ABORD : voir l'encadré. Aucun des deux ⇒ la sélection passe telle quelle. */
  const aEcarter = ajouteAncien ? actuels : (ajouteActuel ? anciens : null);
  if (aEcarter === null) return { parties: [...apres], decoche: null };
  const parties = apres.filter((a) => !aEcarter.has(a.trim().toLowerCase()));
  /* 🔴 ON NE DIT « BASCULÉ » QUE SI QUELQUE CHOSE A VRAIMENT ÉTÉ DÉCOCHÉ : une mention qui paraît sans raison
     fait chercher ce qui a changé. */
  if (parties.length === apres.length) return { parties, decoche: null };
  return { parties, decoche: ajouteAncien ? 'actuels' : 'anciens' };
}

/**
 * ══ 🔴🔴 LE CHOIX DE DÉPART — ET LE CAS QUE « LE LOCATAIRE EN PLACE » N'AURAIT PAS COUVERT ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE LA MESURE A TROUVÉ, ET QUE LA RÈGLE PRISE AU MOT AURAIT ABÎMÉ. Arno vérifie ce lot sur trois biens.
 * Le troisième — « bien 315 », fiche lot-237 — **N'A AUCUN LOCATAIRE EN PLACE** : deux anciens seulement
 * (LEON GUIMAREY DI FIORE, sorti le 28/09/2026 ; MOUDNI Imane, sortie le 16/01/2025). « Par défaut : seulement
 * le locataire EN PLACE » y désigne PERSONNE : l'encart Locataire serait arrivé VIDE sur un logement qui porte
 * des années d'échanges, et l'on aurait cru que ce bien n'a jamais eu de locataire.
 *
 * 🔴 C'EST UN MASQUAGE, ET LE DÉPÔT L'INTERDIT SANS L'ACCORD D'ARNO. Le défaut tombe donc sur le DERNIER
 * locataire connu — le plus récemment sorti. Rien n'est caché : la ligne du pied nomme celui qu'on affiche, et
 * l'autre est à un clic. Et c'est déjà la lecture que la maison fait d'un logement vacant trois blocs plus haut
 * (`motLocataireDeLaPeriode` : « logement vacant depuis le … · dernier locataire … »).
 *
 * ⚠️ LA PÉRIODE N'EST **PAS** RÉGLÉE POUR AUTANT À L'ARRIVÉE. `periodeDuChoixLocataire` n'est appelée que par le
 * geste de choix, jamais à l'initialisation : arriver sur la fiche d'un logement vacant ne doit pas resserrer en
 * silence le listing sur un bail de 2025. Les dates ne bougent que si l'on clique.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function choixLocataireParDefaut(cartes: readonly CarteLocataireBien[]): ChoixLocataire {
  if (cartes.some((c) => c.enPlace)) return CHOIX_LOCATAIRE_DEFAUT;
  const passes = anciensLocataires(cartes);
  return passes.length === 0 ? CHOIX_LOCATAIRE_DEFAUT : { sorte: 'ancien', cle: passes[0].cle };
}

/**
 * Y a-t-il quelqu'un dans le logement ? C'est ce qui décide si l'option « Locataire en place » est OFFERTE : sur
 * un logement vacant, elle ne désignerait personne, et une option qui ne mène à rien est un mensonge d'écran.
 */
export function ilYAUnLocataireEnPlace(cartes: readonly CarteLocataireBien[]): boolean {
  return cartes.some((c) => c.enPlace);
}

/** La carte désignée par un choix, ou `undefined`. PUR. */
export function carteChoisie(
  cartes: readonly CarteLocataireBien[], choix: ChoixLocataire,
): CarteLocataireBien | undefined {
  return choix.sorte === 'ancien' ? cartes.find((c) => c.cle === choix.cle) : undefined;
}

/**
 * ══ 🔴🔴 LA RÈGLE, ÉCRITE UNE FOIS : QUELLES ADRESSES L'ENCART LOCATAIRE GARDE. PUR. ════════════════════════════
 *
 * 🔴 TROIS CAS, ET LE TROISIÈME EST CELUI QUI PROTÈGE. Une adresse rangée « locataire » est gardée si :
 *   ① elle appartient à la carte CHOISIE (le locataire en place par défaut, ou l'ancien sélectionné) ;
 *   ② — ou elle n'appartient à AUCUNE carte de locataire de ce bien.
 * Elle est écartée si, et seulement si, elle appartient à UNE AUTRE carte. C'est exactement « jamais deux
 * périodes dans la même recherche », et rien de plus.
 *
 * 🔴 POURQUOI ② N'EST PAS UN OUBLI. Une adresse rangée « locataire » à la main dans le carrousel — la sœur du
 * locataire, son employeur, un ami qui écrit pour lui — n'appartient à aucune occupation : aucune période ne
 * peut donc l'exclure. L'écarter aurait fait disparaître sa capsule sans que rien ne le dise, c'est-à-dire
 * retiré une fonctionnalité pour faire propre. On la garde, quel que soit le locataire choisi.
 *
 * ⚠️ `cartes` VIDE ⇒ ON NE GARDE RIEN DEHORS : sans aucune carte connue, toutes les adresses relèvent du cas ②,
 * et l'encart est EXACTEMENT celui d'avant ce lot. C'est ce qui rend le changement gratuit pour les biens dont
 * la fiche ne porte aucune occupation.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — LA RÈGLE S'ÉTEND AUX CONTACTS ANNEXES ═════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (lot-146) : `louisvaglio@live.fr` paraissait avec le locataire ACTUEL et DISPARAISSAIT avec
 * VAGLIO ARNAUD, à qui il appartient.
 *
 * 🔴 CE QU'UNE CARTE « PORTE » NE SE LIMITAIT QU'À SES PROPRES ADRESSES — celles du bail. Les contacts ANNEXES
 * (une seconde adresse du locataire, un proche, un garant) n'y figurent pas : rien ne les rattachait à une
 * location, et c'est la période en vigueur qui décidait seule de leur présence. D'où le défaut, exactement.
 *
 * 🔴 ON LEUR AJOUTE DONC UNE SECONDE SOURCE : la CO-PARTICIPATION, mesurée en base — les adresses qui paraissent
 * dans les mails où paraissent celles de la carte (voir `contactsParLocataire`). Les deux sources alimentent la
 * MÊME règle à trois cas ci-dessous : une adresse réclamée par une carte suit cette carte, et aucune autre.
 *
 * ⚠️ `contacts` VIDE ⇒ COMPORTEMENT D'AVANT CE LOT, AU CARACTÈRE PRÈS. C'est la valeur par défaut, et c'est ce
 * qui laisse intacts les écrans et les épreuves qui ne la passent pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function clesDesCartesDeLadresse(
  adresse: string,
  cartes: readonly CarteLocataireBien[],
  contacts: readonly ContactDeLocataire[] = [],
): string[] {
  const a = adresse.trim().toLowerCase();
  if (a === '') return [];
  const cles = new Set<string>();
  for (const c of cartes) if (c.adresses.includes(a)) cles.add(c.cle);
  for (const c of contacts) if (c.adresse.trim().toLowerCase() === a) cles.add(c.cle);
  return [...cles];
}

export function adresseGardeeDansLencart(
  adresse: string, cartes: readonly CarteLocataireBien[], choix: ChoixLocataire,
  /** 🔴🔴 LOT HISTORIQUE-BIEN-16 — les contacts annexes que chaque carte réclame. Vide ⇒ règle d'avant ce lot. */
  contacts: readonly ContactDeLocataire[] = [],
): boolean {
  const a = adresse.trim().toLowerCase();
  if (a === '') return true;
  const porteuses = clesDesCartesDeLadresse(a, cartes, contacts);
  // ② Aucune carte ne la réclame : aucune période ne peut l'exclure.
  if (porteuses.length === 0) return true;
  // ① Elle appartient à la carte choisie.
  const choisies = choix.sorte === 'en_place'
    ? cartes.filter((c) => c.enPlace).map((c) => c.cle)
    : [choix.cle];
  return porteuses.some((cle) => choisies.includes(cle));
}

/**
 * ══ 🔴🔴 LA PÉRIODE QUE LE CHOIX IMPOSE. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « Choisir un ancien locataire règle automatiquement la PÉRIODE sur ses dates d'occupation (modifiable
 * ensuite) ; revenir au locataire en place remet la période précédente. »
 *
 * 🔴 LA SORTE EST `dates`, ET NON `occupation`, ET LE MOT « MODIFIABLE ENSUITE » D'ARNO LE DÉCIDE. C'est très
 * exactement ce que fait déjà `reglerPeriodeSurLeBail` quand on clique la date dans une capsule : poser les
 * bornes dans les DEUX champs de dates, où l'on peut les retoucher. Rendre `occupation` aurait allumé le bouton
 * « Depuis l'entrée du dernier locataire » — qui désigne le DERNIER locataire, pas celui qu'on vient de choisir :
 * le bloc aurait affiché un bouton actif qui dit autre chose que les dates qu'il montre.
 *
 * ⚠️ `null` POUR LE LOCATAIRE EN PLACE : ce n'est pas « aucune période », c'est « ce n'est pas à moi d'en poser
 * une ». L'écran remet alors celle qu'il avait mise de côté — c'est lui qui s'en souvient, pas ce module.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — UN ÉVÉNEMENT PROLONGE LA PÉRIODE D'UN LOCATAIRE ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « si un ÉVÉNEMENT le concerne et se poursuit APRÈS sa sortie (litige, dépôt de
 * garantie, n'importe quel type), la date de fin devient la date de CLÔTURE de cet événement, ou AUJOURD'HUI
 * s'il n'est pas clos. Avec plusieurs événements, on prend la fin la plus tardive. »
 *
 * 🔴 POURQUOI C'EST JUSTE, ET MESURÉ. Un dépôt de garantie se règle des mois après le départ : sur lot-146, les
 * sept mails du dépôt de VAGLIO vont du 11/11/2025 au 30/09/2026, alors que son bail s'est achevé le 22/10/2025.
 * Bornée au bail, la recherche n'en montrait AUCUN — c'est le même aveuglement que le lot 16 a fermé côté
 * contacts, vu cette fois du côté des dates.
 *
 * ⚠️ ELLE NE PROLONGE JAMAIS VERS LE PASSÉ, et ne raccourcit rien : seule une fin PLUS TARDIVE que la sortie est
 * retenue. Un événement ouvert et clos pendant le bail ne change donc rien — il n'y a rien à prolonger.
 *
 * ⚠️ RIEN POUR UN LOCATAIRE EN PLACE : sa période n'a pas de borne haute (`au: null`), elle couvre déjà tout.
 * Lui poser une fin au nom d'un événement l'aurait au contraire RACCOURCIE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface EvenementDuLocataire {
  /** La clé de la carte concernée : `occ-<id d'occupation>`. */
  cle: string;
  evenementId: number;
  reference: string;
  objet: string;
  ouvert: boolean;
  ouvertLe: string | null;
  closLe: string | null;
  /** Par quelle branche de la définition il est rattaché — voir `evenementsParLocataire`. */
  par: 'occupation' | 'adresse';
}

/** Le jour où un événement finit : sa clôture, ou aujourd'hui s'il est encore ouvert. PUR. */
export function finDeLEvenement(e: EvenementDuLocataire, maintenant: Date): string {
  if (e.ouvert || e.closLe === null || e.closLe === '') return jourParis(maintenant);
  return (jourValide(e.closLe.slice(0, 10)) ?? jourParis(maintenant));
}

/**
 * La fin prolongée d'une occupation, et l'événement qui la prolonge. PUR.
 *
 * `parEvenement` est `null` quand rien ne prolonge — et c'est ce `null` qui fait taire la phrase d'explication.
 */
export function finProlongee(
  carte: CarteLocataireBien,
  evenements: readonly EvenementDuLocataire[],
  maintenant: Date,
): { au: string | null; parEvenement: EvenementDuLocataire | null } {
  const sortie = jourValide((carte.jusqua ?? '').slice(0, 10));
  /* 🔴 LOCATAIRE EN PLACE : aucune borne haute à prolonger — la période couvre déjà jusqu'à aujourd'hui. */
  if (sortie === null) return { au: null, parEvenement: null };
  let au = sortie;
  let par: EvenementDuLocataire | null = null;
  for (const e of evenements) {
    if (e.cle !== carte.cle) continue;
    const fin = finDeLEvenement(e, maintenant);
    if (fin > au) { au = fin; par = e; }
  }
  return { au, parEvenement: par };
}

/**
 * ══ 🔴 LA PHRASE QUI L'EXPLIQUE, EN CLAIR ═══════════════════════════════════════════════════════════════════════
 *
 * Arno : « La "PÉRIODE RETENUE" l'explique en clair : "du 06/02/2025 au 15/03/2026 — prolongée par l'événement
 * « Litige dépôt de garantie »". »
 *
 * 🔴 ELLE EST INDISPENSABLE, ET PAS DÉCORATIVE : sans elle, la période affichée ne correspond plus aux dates du
 * bail, et l'on croirait à une erreur. Une règle qui ne se voit pas est une règle qu'on finit par contourner.
 *
 * ⚠️ `null` QUAND RIEN NE PROLONGE : une mention permanente apprend à ne plus être lue.
 *
 * ⚠️ L'OBJET DE L'ÉVÉNEMENT, PAS SA RÉFÉRENCE : « EV-2026-007 » ne dit rien ; « Litige dépôt de garantie » dit
 * tout. La référence reste dans l'info-bulle du cartouche, où on la cherche quand on en a besoin.
 */
export function motProlongation(e: EvenementDuLocataire | null): string | null {
  if (e === null) return null;
  const quoi = e.objet.trim() === '' ? e.reference : e.objet.trim();
  return `prolongée par l’événement « ${quoi} »`;
}

export function periodeDuChoixLocataire(
  cartes: readonly CarteLocataireBien[], choix: ChoixLocataire,
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — les événements qui concernent chaque carte. Vides ⇒ la période est
   * celle du bail, exactement comme avant ce lot.
   */
  evenements: readonly EvenementDuLocataire[] = [],
  maintenant?: Date,
): ChoixPeriode | null {
  const c = carteChoisie(cartes, choix);
  if (c === undefined) return null;
  const p = periodeDeLOccupation({ libelle: c.libelle, depuis: c.depuis, jusqua: c.jusqua });
  /* ⚠️ SANS HORLOGE, AUCUNE PROLONGATION : un événement OUVERT finit « aujourd'hui », et cette fonction ne lit
     pas l'heure elle-même — une fonction qui le ferait ne pourrait pas être éprouvée deux jours de suite. */
  if (maintenant === undefined) return { sorte: 'dates', du: p.du, au: p.au };
  const { au } = finProlongee(c, evenements, maintenant);
  return { sorte: 'dates', du: p.du, au: au ?? p.au };
}

/**
 * L'événement qui prolonge la période du choix, ou `null`. PUR.
 *
 * ⚠️ IL EST RENDU À PART DE LA PÉRIODE, et non glissé dedans : `ChoixPeriode` est lu par la route, par la frise
 * et par trois boutons. Y ajouter un champ d'explication aurait fait voyager une phrase d'écran jusqu'au SQL.
 */
export function evenementQuiProlonge(
  cartes: readonly CarteLocataireBien[], choix: ChoixLocataire,
  evenements: readonly EvenementDuLocataire[], maintenant: Date,
): EvenementDuLocataire | null {
  const c = carteChoisie(cartes, choix);
  if (c === undefined) return null;
  return finProlongee(c, evenements, maintenant).parEvenement;
}

/**
 * ══ 🔴🔴 LA PHRASE, MAIS SEULEMENT TANT QU'ELLE DIT VRAI ════════════════════════════════════════════════════════
 *
 * La mention « — prolongée par l'événement … » explique les dates AFFICHÉES. Elle ne doit donc paraître que si
 * ce sont bien celles que la prolongation a posées.
 *
 * 🔴 POURQUOI CE GARDE-FOU EXISTE. Les bornes restent modifiables à la main (« Dates personnalisées »), et les
 * quatre boutons de période sont toujours là. Si l'on ramène la fin au 22/10/2025 après avoir choisi VAGLIO, la
 * phrase affirmerait une prolongation que l'écran ne montre plus — elle désignerait un événement sans objet.
 *
 * ⚠️ COMPARAISON SUR LES DEUX BORNES, pas seulement la fin : revenir au début du bail d'un autre locataire
 * laisserait sinon la mention de l'ancien choix accrochée à une période qui n'est plus la sienne.
 */
export function motProlongationDeLaPeriode(
  cartes: readonly CarteLocataireBien[], choix: ChoixLocataire,
  evenements: readonly EvenementDuLocataire[], periode: ChoixPeriode, maintenant: Date,
): string | null {
  const attendue = periodeDuChoixLocataire(cartes, choix, evenements, maintenant);
  if (attendue === null || attendue.sorte !== 'dates') return null;
  if (periode.sorte === 'tous') return null;
  if (periode.du !== attendue.du || periode.au !== attendue.au) return null;
  return motProlongation(evenementQuiProlonge(cartes, choix, evenements, maintenant));
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
      /* 🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — le nom REÇU suit la pièce : le bandeau de renommage de la
         visionneuse l'écrit (« reçue sous : … »), et replie sur le nom affiché quand il manque. */
      nomOrigine: p.nomOrigine ?? p.nomFichier,
      typeMime: p.typeMime,
      tailleOctets: p.tailleOctets,
      disponible: p.disponible,
      motifNonStocke: p.motifNonStocke,
      empreinte: p.empreinte ?? null,
    })),
  }));
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LES PORTEURS DE PIÈCES DE LA SÉLECTION, SOUS LA FORME DU RÉSUMÉ. PURE.
 *
 * Le jumeau de `messagesDuFil`, pour l'autre source : celle-ci ne vient pas de la page affichée mais de la
 * lecture `/historique/pieces`, qui rend TOUS les mails porteurs de la sélection (voir l'encadré de la route).
 *
 * 🔴 ELLE EXISTE POUR UNE SEULE RAISON, ET ELLE EST DE TYPAGE : `PieceHistorique.empreinte` est FACULTATIVE (une
 * réponse d'API plus ancienne que le lot 1 ne la porte pas), là où le module des pièces l'exige. `undefined` et
 * `null` y veulent dire la même chose — « pas d'empreinte connue, rapprochement par nom et taille » —, et c'est
 * ici qu'on le dit une fois pour toutes, comme `messagesDuFil` le fait pour les lignes du fil.
 *
 * ⚠️ AUCUN FILTRE ICI : ni « ._ », ni image de signature. `piecesDeLaConversation` les écarte déjà par
 * `vraiesPiecesDuMessage`, et un second tamis aurait fait deux comptes pour une seule question.
 */
export function messagesDesPorteurs(
  messages: readonly MessagePorteurDePieces[],
): MessagePorteur[] {
  return messages.map((m) => ({
    messageId: m.messageId,
    recuLe: m.recuLe,
    sens: m.sens,
    de: m.de,
    deNom: m.deNom,
    objet: m.objet,
    pieces: m.pieces.map((p) => ({
      pieceId: p.pieceId,
      nomFichier: p.nomFichier,
      /* 🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — le nom REÇU suit la pièce : le bandeau de renommage de la
         visionneuse l'écrit (« reçue sous : … »), et replie sur le nom affiché quand il manque. */
      nomOrigine: p.nomOrigine ?? p.nomFichier,
      typeMime: p.typeMime,
      tailleOctets: p.tailleOctets,
      disponible: p.disponible,
      motifNonStocke: p.motifNonStocke,
      empreinte: p.empreinte ?? null,
    })),
  }));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦-ter 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — QUI A ENVOYÉ CETTE PIÈCE ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CONSTAT D'ARNO (05/10/2026, lot-146, SEUL le groupe Propriétaire coché) : « au milieu des pièces de Blandine
   Piriou, le résumé montre "RIB - Boursorama Thomas Derrien.pdf", reçu de DERRIEN Thomas (ancien locataire) le
   12/02/2025 15:33, avec un liseré vert. »

   🔴 MESURÉ EN BASE — message 52187, fil 32947, « Re: Bilan des charges Ternes » :

       De  : thomas.derrien@hec.edu      (DERRIEN Thomas — ancien locataire, bail clos le 31/01/2025)
       À   : blandine.piriou@gmail.com   (Blandine Piriou — LA PROPRIÉTAIRE COCHÉE)
       Cc  : alizee.acket@hec.edu        (l'autre ancienne locataire)
             gestion@criterimmo.fr, jb.pons@sansvisavis.com   (nous)

   Ce n'est donc PAS « le propriétaire en copie » : la propriétaire est le destinataire DIRECT. Le mail entre dans
   la sélection par elle, et c'est JUSTE pour le listing — ce courrier la concerne, il doit s'afficher. Le liseré
   vert, lui, est exact aussi : il porte la couleur de l'EXPÉDITEUR, qui est un locataire.

   🔴 CE QUI EST FAUX, C'EST LE RÉSUMÉ DES PIÈCES. Un résumé de pièces répond à « quels documents cette partie
   nous a-t-elle fournis » ; un RIB envoyé par un ancien locataire n'est pas un document de la propriétaire,
   quand bien même elle le recevait. La règle d'Arno le dit mot pour mot :

       « une pièce n'y figure que si son mail a été ENVOYÉ PAR une partie cochée, ou ENVOYÉ PAR NOUS
         (agence cochée) À une partie cochée (À ou Cc). Une pièce envoyée par une partie NON cochée n'y
         figure jamais, même si une partie cochée était en copie. »

   🔴🔴 LE PIÈGE QUI AURAIT TOUT CASSÉ, ET QUI EST FERMÉ ICI : **AUCUNE PARTIE COCHÉE**. Prise à la lettre, la
   règle écarterait alors TOUT (rien n'est « envoyé par une partie cochée » quand il n'y en a pas), et le résumé
   du cas ORDINAIRE — celui de l'arrivée sur la fiche — serait VIDE. C'est le piège du lot 71 (un ensemble vide
   n'est jamais « tout satisfait ») sous un autre visage. Sans partie cochée, le listing dit « tous les mails du
   bien sont affichés » : le résumé les suit, sans filtre.

   ⚠️ L'AGENCE N'EST PAS RELUE ICI, ET C'EST VOULU. « Agence cochée » est déjà tenu par le SERVEUR : une adresse
   décochée part en `expediteursExclus`, et ses mails ne sont dans NI le listing NI cette lecture. Un envoi qui
   arrive jusqu'ici vient donc, par construction, d'une adresse cochée. Le revérifier ici aurait fait un second
   juge de la même règle — et deux juges finissent toujours par diverger.
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'il faut d'un mail pour savoir si sa pièce entre au résumé : son sens, son expéditeur, ses destinataires. */
export interface PorteurAdresse {
  sens: 'recu' | 'envoye';
  de: string;
  a: readonly PersonneDuMail[];
  cc: readonly PersonneDuMail[];
}

/** Les parties cochées, en forme canonique. Un ensemble vide veut dire « aucun filtre », jamais « personne ». */
export function partiesCochees(parties: readonly string[]): ReadonlySet<string> {
  return new Set(parties.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''));
}

/**
 * ══ 🔴🔴 LA RÈGLE D'ARNO, ÉCRITE UNE FOIS. PURE. ════════════════════════════════════════════════════════════════
 *
 * `true` ⇒ les pièces de ce mail entrent au résumé.
 *
 * ⚠️ `cc` COMPTE POUR **NOS** ENVOIS, ET PAS POUR LES RÉCEPTIONS, et ce n'est pas une inconséquence : « envoyé
 * par nous À une partie cochée (À ou Cc) » est la demande d'Arno à la lettre. Quand nous écrivons, mettre
 * quelqu'un en copie, c'est lui adresser le document ; quand un tiers écrit, la copie ne fait pas de lui
 * l'auteur de la pièce — c'est exactement le cas du RIB de DERRIEN.
 */
export function porteurRetenuAuResume(m: PorteurAdresse, cochees: ReadonlySet<string>): boolean {
  // 🔴🔴 AUCUNE PARTIE COCHÉE ⇒ AUCUN FILTRE. Voir l'encadré : à la lettre, la règle viderait le cas ordinaire.
  if (cochees.size === 0) return true;
  if (m.sens === 'recu') return cochees.has(m.de.trim().toLowerCase());
  return [...m.a, ...m.cc].some((p) => cochees.has(p.adresse.trim().toLowerCase()));
}

/**
 * Les porteurs gardés et ceux écartés, en UN seul parcours. PUR.
 *
 * 🔴 LES DEUX MOITIÉS SONT RENDUES, ET NON LA SEULE BONNE : c'est l'écart qui permet d'écrire la phrase d'Arno
 * (« N pièces envoyées par des parties non cochées ne sont pas reprises dans le résumé ») en comptant les pièces
 * écartées PAR LE MÊME CALCUL que celles qu'on montre — dédoublonnage et pièces techniques compris. Les compter
 * à part aurait fait deux arithmétiques pour un seul nombre affiché.
 */
export function partagerPourLeResume<T extends PorteurAdresse>(
  porteurs: readonly T[], cochees: ReadonlySet<string>,
): { gardes: T[]; ecartes: T[] } {
  const gardes: T[] = [];
  const ecartes: T[] = [];
  for (const m of porteurs) (porteurRetenuAuResume(m, cochees) ? gardes : ecartes).push(m);
  return { gardes, ecartes };
}

/**
 * ══ 🔴 LA PHRASE DISCRÈTE, SOUS LA LIGNE D'ÉTAT. PURE. ══════════════════════════════════════════════════════════
 *
 * Arno : « Sous la ligne d'état, une phrase discrète apparaît SEULEMENT si c'est le cas. »
 *
 * 🔴 `null` QUAND IL N'Y A RIEN À DIRE, et c'est tout l'intérêt : une phrase permanente « 0 pièce écartée »
 * aurait appris à l'œil à ne plus la lire, et le jour où elle dit quelque chose on ne la verrait plus.
 *
 * ⚠️ LE SINGULIER EST ÉCRIT, parce qu'il arrive : « 1 pièce envoyée par une partie non cochée » se lit encore
 * comme une phrase française, « 1 pièces » non — et c'est le genre de détail qui fait douter du nombre lui-même.
 */
export function motPiecesEcartees(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const k = Math.trunc(n);
  return k === 1
    ? '1 pièce envoyée par une partie non cochée n’est pas reprise dans le résumé.'
    : `${k} pièces envoyées par des parties non cochées ne sont pas reprises dans le résumé.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦-quater 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — NOS ENVOIS : À QUELLE PARTIE ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   DEMANDE D'ARNO (05/10/2026), mot pour mot : « Dans le résumé des pièces (et sur les miniatures du mail déplié),
   pour toute pièce ENVOYÉE PAR NOUS, ajoute sous la date une ligne par partie destinataire : flèche rouge
   "→ envoyé à la partie propriétaire", flèche verte "→ envoyé à la partie locataire", flèche bleue "→ envoyé à la
   partie tiers indépendant" ; gris "→ envoyé à un destinataire non affecté" si besoin. Si plusieurs parties sont
   destinataires, une ligne par partie. »

   🔴 À QUOI CELA RÉPOND. Le résumé dit déjà « envoyé le 7 novembre » ; il ne disait pas À QUI. Sur un bien où le
   propriétaire, le locataire et l'assureur reçoivent chacun des documents, c'est pourtant la première question
   qu'on se pose devant une pièce sortante — et la seule réponse était d'ouvrir le mail.

   🔴 UNE LIGNE PAR PARTIE, ET NON PAR ADRESSE. Un couple propriétaire à deux adresses ne doit pas produire deux
   lignes rouges identiques : la question est « à quelle PARTIE », et les adresses sont le DÉTAIL, qui vit dans
   l'info-bulle du « i ». L'inverse aurait donné quatre lignes là où il y a deux parties.

   ⚠️ NOS PROPRES ADRESSES SONT ÉCARTÉES, et c'est un fait, pas une préférence : nous mettre en copie de notre
   propre envoi (ce que fait la moitié de nos messages) n'est pas « envoyer à une partie ». Les compter aurait
   ajouté une ligne grise « destinataire non affecté » sous presque chaque pièce sortante — un bruit qui aurait
   fait cesser de lire les trois lignes utiles.

   ⚠️ LA CATÉGORIE EST CELLE DE CE BIEN, lue dans la MÊME carte que les pastilles De / À / Cc du mail déplié
   (demande d'Arno : « même source »). Une adresse est « locataire » sur un logement et « tiers » sur un autre ;
   une seconde lecture aurait fini par peindre la flèche d'une couleur et la pastille d'une autre, sur la même
   ligne et pour la même personne.
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ══ 🔴🔴 RETIRÉ LE 07/10/2026 — LOT PJ-STATUT-ENVOI-FAMILLES ══════════════════════════════════════════════════
   Vivaient ici `AdresseDestinataire`, `PartieDestinataire`, `motPartieDestinataire`, `partiesDestinataires` et
   `detailPartieDestinataire` : les LIGNES « → envoyé à la partie propriétaire » du lot HISTORIQUE-BIEN-14.

   🔴 ARNO LES REMPLACE PAR DES CAPSULES, et le remplacement change le FOND autant que la forme :
     · une famille de plus — INTERNE —, que l'ancienne règle ÉCARTAIT (« nous mettre en copie n'est pas envoyer à
       une partie »). Arno tranche autrement : un collègue destinataire est une information. Seule la BOÎTE
       elle-même reste écartée ;
     · « non affecté » devient EXTÉRIEUR ;
     · le Cci entre dans le calcul quand on le connaît ;
     · un seul « i » pour toute la pièce, au lieu d'un par ligne.
   Garder l'ancienne fonction à côté aurait donné deux réponses à « vers qui cette pièce est-elle partie ».

   ⇒ `app/lib/gestion/familleDestinataire.ts`, qui porte aussi — et c'est le point 3b d'Arno — le calcul des
   catégories du bloc PARTIES, descendu de `Annuaire.tsx` et de `HistoriqueDuBien.tsx` pour que les capsules et le
   bloc lisent la MÊME fonction au lieu de deux copies. */

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
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — CE QUE LE RÉSUMÉ COUVRE, DIT SOUS LE BOUTON. PUR. ════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Retire la phrase “le résumé porte sur les 100 mails affichés” une fois que
 * c'est vrai. » Elle est donc retirée — **et remplacée par rien, dans le cas ordinaire** : `null`.
 *
 * 🔴 LA PHRASE NE DOIT PARAÎTRE QUE QUAND LE RÉSUMÉ NE COUVRE PAS LA SÉLECTION. C'est tout l'objet de cette
 * fonction : trois situations seulement le font, et aucune n'est celle d'hier.
 *
 *   ① LA LECTURE A ABOUTI ET N'A PAS BUTÉ ⇒ **rien à dire**. Le résumé couvre la sélection entière, le bouton
 *      « N pièces dans cette sélection » est exact, et une note sous un compte exact ne fait que semer le doute.
 *   ② ELLE A BUTÉ SUR SA BORNE (`PORTEURS_DE_PIECES_MAX`) ⇒ on le DIT, avec le nombre. Mesuré le 05/10/2026 : un
 *      seul bien du dépôt s'en approche (281, 2 735 mails porteurs), et c'est un rangement à corriger.
 *   ③ UNE RECHERCHE EST EN COURS ⇒ le résumé redevient celui de la page, et c'est VOULU. La recherche ne filtre
 *      que les mails CHARGÉS (règle d'Arno au lot 3, point 5 : elle lit le corps et le nom des pièces, que la
 *      route ne sait pas interroger). Un résumé qui couvrirait toute la sélection pendant qu'on cherche
 *      montrerait des pièces de mails que le fil n'affiche plus — le défaut qu'on répare, retourné.
 *   ④ LA LECTURE A ÉCHOUÉ ⇒ on retombe sur la page, et on le dit AUTREMENT : « n'ont pas pu être lues ». Une
 *      panne et une recherche ne doivent pas s'écrire de la même façon, sinon personne ne saura qu'il y a eu
 *      panne.
 *
 * ⚠️ `filIncomplet` TRANCHE LES TROIS DERNIERS CAS. Si le fil affiche DÉJÀ toute la sélection (moins de 100
 * mails, ce qui est le cas de la quasi-totalité des biens), la page EST la sélection : le résumé est exact de
 * toute façon, et il n'y a rien à signaler. Une note qui s'afficherait là serait un avertissement sans objet —
 * et c'est ainsi qu'on apprend à ne plus les lire.
 */
export function motPorteeDuResume(p: {
  /** Vrai quand le résumé a été construit sur la lecture dédiée, donc sur TOUTE la sélection. */
  surToutLaSelection: boolean;
  /** Vrai quand cette lecture a buté sur sa borne. */
  tronquee: boolean;
  /** Vrai quand elle n'a pas abouti (réseau, base, droit perdu). */
  enEchec: boolean;
  /** Vrai quand une recherche par mots est en cours : le résumé est alors celui des mails chargés. */
  rechercheActive: boolean;
  /** Vrai quand le fil n'affiche qu'une PARTIE de la sélection (plafond de page atteint). */
  filIncomplet: boolean;
  /** Combien de mails sont réellement affichés — le périmètre de repli. */
  nbAffiches: number;
}): string | null {
  if (p.surToutLaSelection) {
    return p.tronquee
      ? `Cette sélection compte plus de ${PORTEURS_DE_PIECES_MAX} mails porteurs de pièces : le résumé porte `
        + `sur les ${PORTEURS_DE_PIECES_MAX} plus récents.`
      : null;
  }
  if (!p.filIncomplet) return null;
  if (p.rechercheActive) {
    return `La recherche ne lit que les mails chargés : le résumé porte sur les ${p.nbAffiches} trouvés parmi `
      + 'eux. « Voir la suite → » en charge d’autres.';
  }
  if (p.enEchec) {
    return `Les pièces de toute la sélection n’ont pas pu être lues : le résumé porte sur les ${p.nbAffiches} `
      + 'mails affichés. « Voir la suite → » en montre les suivants.';
  }
  // Lecture encore en cours : on ne dit rien plutôt que d'annoncer une portée qui va changer dans l'instant.
  return null;
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
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LE CAS « AUCUNE PERSONNE COCHÉE » A DISPARU, ET C'EST EXACT : une
   * liste de parties vide veut maintenant dire « tous les mails du bien », pas « personne ». Le fil ne peut donc
   * plus être vide pour cette raison-là. Le cas qui le remplace est l'agence seule décochée sur un bien où nous
   * sommes l'unique expéditeur — et son remède est de la recocher, pas d'élargir une période.
   */
  if (r.parties.length === 0 && r.agenceEcartee.length > 0) {
    return 'Tous les mails de ce bien ont été écrits par notre agence, et « Notre agence » est décochée. '
      + 'Recochez-la pour les revoir.';
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
