/**
 * MODULE « GESTION » — LOT RATTACHEMENT-1 : DE QUOI CE MAIL PARLE-T-IL ? Module PUR (aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MOTEUR TRAVAILLE SUR LES ADRESSES DÉJÀ RELEVÉES PAR LE LOT DRIVE-2-bis, et sur rien d'autre. Il ne relit pas
 * un mail, ne rouvre pas un corps, n'interroge pas Gmail : la table `gestion_message_adresse` porte déjà les cinq
 * rôles de chaque adresse (expéditeur, destinataire, copie, répondre-à, expéditeur d'origine d'un transfert), et ce
 * que l'annuaire en dit À LA DATE DU MAIL. C'est exactement la matière dont on a besoin.
 *
 * 🔴 IL COUVRE TOUS LES MAILS, PIÈCE JOINTE OU PAS. C'est la différence de fond avec le moteur de tri des pièces :
 * l'objectif est l'historique COMPLET des échanges d'un logement, et un mail sans pièce jointe en fait pleinement
 * partie — souvent c'est lui qui porte la décision, la pièce n'étant que sa preuve.
 *
 * ═══ LES DEUX SEULES RÈGLES, ET POURQUOI IL N'EN FAUT PAS UNE TROISIÈME ═════════════════════════════════════════
 * (a) LES ADRESSES DU MAIL LUI-MÊME. Une seule cible cohérente ⇒ lien AUTOMATIQUE, vivant, réversible.
 * (b) LES ADRESSES DE TOUT L'ÉCHANGE, quand le mail seul ne dit rien. ⇒ CANDIDAT, jamais un lien automatique.
 *
 * 🔴 POURQUOI (b) NE DEVIENT JAMAIS AUTOMATIQUE, même quand elle ne désigne qu'une cible. Les mails que (b) doit
 * sauver sont précisément ceux d'un tiers — syndic, artisan, assureur — dont aucune adresse n'est à l'annuaire. Leur
 * rattacher d'office le logement du voisin de fil, c'est écrire dans le dossier d'un client une pièce qui n'est
 * peut-être pas la sienne, sans que personne le voie. Un candidat coûte un clic ; une erreur silencieuse coûte la
 * confiance dans tout l'historique.
 *
 * ⚠️ NOS ADRESSES NE SERVENT JAMAIS DE CLÉ. `gestion@`, le domaine de la maison et la comptabilité externalisée sont
 * des deux côtés de presque tous les mails : s'en servir rattacherait tout au même endroit. Elles sont déjà marquées
 * `interne` en base — ce module les écarte, il ne les recalcule pas.
 *
 * ⚠️ ON NE TRANCHE JAMAIS AU JUGÉ. Deux logements désignés ne donnent pas « le premier » : ils donnent DEUX
 * candidats, plus leur propriétaire commun s'il existe. « Je ne sais pas » est une réponse ; deviner n'en est pas une.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Confiance, Regle } from './triPieces';
import type { AdresseEchange } from './propositionTri';

export type CibleSorte = 'lot' | 'proprietaire' | 'evenement';

/**
 * CE À QUOI ON RATTACHE. Un lot ou un propriétaire par leur clé WIPPIMMO — la seule identité qui survive à un
 * ré-import de l'annuaire ; un événement par l'identifiant de sa carte.
 */
export interface Cible {
  sorte: CibleSorte;
  /** Clé WIPPIMMO, pour `lot` et `proprietaire`. `null` pour un événement. */
  cle: string | null;
  /** Identifiant de la carte, pour `evenement`. `null` sinon. */
  id: number | null;
}

export interface Candidat {
  cible: Cible;
  regle: Regle;
  confiance: Confiance;
  motif: string;
  /** Les adresses qui fondent ce candidat. Dédoublonnées, dans l'ordre où on les a rencontrées. */
  adresses: string[];
}

/** Ce que l'examen d'un mail conclut. Les trois issues sont exclusives. */
export type Issue = 'automatique' | 'a_trier' | 'sans_candidat';

export interface Examen {
  issue: Issue;
  /** Le lien certain, quand il y en a UN seul. `null` dans les deux autres issues. */
  certain: Candidat | null;
  /** Les candidats soumis au tri. Vide quand `issue` vaut `automatique` ou `sans_candidat`. */
  candidats: Candidat[];
  /** Combien d'adresses de ce mail l'annuaire a reconnues, les nôtres exclues. */
  adressesUtiles: number;
  motif: string;
}

/** Deux cibles désignent-elles la même chose ? PUR. */
export function memeCible(a: Cible, b: Cible): boolean {
  return a.sorte === b.sorte && a.cle === b.cle && a.id === b.id;
}

/** Comment une cible s'écrit en une ligne : « lot:495 », « proprio:339 », « carte:12 ». PUR. */
export function cibleCourte(c: Cible): string {
  if (c.sorte === 'evenement') return `carte:${c.id ?? 0}`;
  return `${c.sorte === 'lot' ? 'lot' : 'proprio'}:${c.cle ?? ''}`;
}

export function cibleLot(cle: string): Cible { return { sorte: 'lot', cle, id: null }; }
export function cibleProprietaire(cle: string): Cible { return { sorte: 'proprietaire', cle, id: null }; }
export function cibleEvenement(id: number): Cible { return { sorte: 'evenement', cle: null, id }; }

/** Les adresses UTILISABLES comme clé : ni les nôtres, ni celles que l'annuaire ne connaît pas. PUR. */
export function adressesUtiles(adresses: readonly AdresseEchange[]): AdresseEchange[] {
  return adresses.filter((a) => !a.interne && a.reconnaissance.partie !== null);
}

/** Les adresses, dédoublonnées, dans l'ordre de rencontre. Un même correspondant écrit souvent plusieurs fois. */
function listerAdresses(adresses: readonly AdresseEchange[]): string[] {
  return [...new Set(adresses.map((a) => a.adresse))];
}

interface Vue {
  /** Clé de lot → les adresses qui la désignent. */
  lots: Map<string, AdresseEchange[]>;
  /** Clé de propriétaire → les adresses qui la désignent. */
  proprietaires: Map<string, AdresseEchange[]>;
}

/**
 * CE QUE DÉSIGNE UN GROUPE D'ADRESSES : quels lots, quels propriétaires, et par qui. PUR.
 *
 * ⚠️ UNE ADRESSE DE LOCATAIRE DÉSIGNE LES DEUX à la fois : son lot (occupé à la date du mail) et le propriétaire de
 * ce lot, que la reconnaissance a déjà résolu. On les enregistre tous les deux — c'est ce qui permet, quand deux
 * logements du même bailleur apparaissent, de proposer le bailleur plutôt que de choisir un logement au hasard.
 */
export function vueDesAdresses(adresses: readonly AdresseEchange[]): Vue {
  const lots = new Map<string, AdresseEchange[]>();
  const proprietaires = new Map<string, AdresseEchange[]>();
  for (const a of adressesUtiles(adresses)) {
    const { lotCle, proprietaireCle } = a.reconnaissance;
    if (lotCle !== null && lotCle !== '') lots.set(lotCle, [...(lots.get(lotCle) ?? []), a]);
    if (proprietaireCle !== null && proprietaireCle !== '') {
      proprietaires.set(proprietaireCle, [...(proprietaires.get(proprietaireCle) ?? []), a]);
    }
  }
  return { lots, proprietaires };
}

/**
 * LA CIBLE CERTAINE d'un groupe d'adresses, ou `null`. PUR.
 *
 * 🔴 CERTAIN VEUT DIRE : UNE SEULE LECTURE POSSIBLE. Concrètement —
 *   · un seul logement désigné, et aucun propriétaire qui le contredise ⇒ le logement (le plus précis) ;
 *   · aucun logement mais un seul propriétaire ⇒ le propriétaire (un bailleur qui écrit pour lui-même) ;
 *   · tout le reste ⇒ `null`, et l'appelant fabrique des candidats.
 *
 * ⚠️ « AUCUN PROPRIÉTAIRE QUI LE CONTREDISE » N'EST PAS UNE PRÉCAUTION DE STYLE. Un mail adressé au locataire du
 * logement 495 ET à un bailleur qui n'en est pas le propriétaire parle de deux dossiers. Le rattacher au seul 495
 * ferait disparaître le second de son propre historique — et personne ne remarque une absence.
 */
export function cibleCertaine(v: Vue): { cible: Cible; adresses: AdresseEchange[]; motif: string } | null {
  const lots = [...v.lots.keys()];
  const proprios = [...v.proprietaires.keys()];

  if (lots.length === 1 && proprios.length <= 1) {
    return {
      cible: cibleLot(lots[0]),
      adresses: v.lots.get(lots[0]) ?? [],
      motif: 'un seul logement désigné, et rien qui le contredise',
    };
  }
  if (lots.length === 0 && proprios.length === 1) {
    return {
      cible: cibleProprietaire(proprios[0]),
      adresses: v.proprietaires.get(proprios[0]) ?? [],
      motif: 'un seul propriétaire désigné, aucun logement',
    };
  }
  return null;
}

/**
 * LES CANDIDATS d'un groupe d'adresses : chaque logement vu, puis le propriétaire commun s'il existe. PUR.
 *
 * ⚠️ LE PROPRIÉTAIRE COMMUN EST UN CANDIDAT EN PLUS, jamais à la place. Deux logements du même bailleur peuvent
 * appeler l'un OU l'autre selon le mail : « le dossier du bailleur » quand il s'agit de ses comptes, « ce
 * logement-là » quand il s'agit d'une fuite. Le tri tranchera — c'est son travail, et il a le mail sous les yeux.
 */
export function candidatsDeLaVue(v: Vue, regle: Regle, confiance: Confiance, quoi: string): Candidat[] {
  const out: Candidat[] = [];
  for (const [cle, adresses] of v.lots) {
    out.push({
      cible: cibleLot(cle), regle, confiance,
      motif: `${quoi} : logement désigné parmi ${v.lots.size}`,
      adresses: listerAdresses(adresses),
    });
  }
  for (const [cle, adresses] of v.proprietaires) {
    out.push({
      cible: cibleProprietaire(cle), regle,
      // Un propriétaire est toujours moins précis qu'un logement : sa confiance ne peut pas être « haute ».
      confiance: confiance === 'haute' ? 'moyenne' : confiance,
      motif: v.lots.size > 1 ? `${quoi} : propriétaire des logements désignés` : `${quoi} : propriétaire désigné`,
      adresses: listerAdresses(adresses),
    });
  }
  return out;
}

/**
 * L'EXAMEN D'UN MAIL. PUR — c'est la fonction que la commande et l'épreuve appellent toutes les deux.
 *
 * L'ORDRE, et il n'est pas indifférent :
 *   ① les adresses DU MAIL (règle a) — si elles désignent une seule cible, le lien est posé AUTOMATIQUEMENT ;
 *   ② sinon, si elles en désignent plusieurs, elles deviennent les CANDIDATS du tri ;
 *   ③ si le mail lui-même ne dit rien, les adresses de TOUT L'ÉCHANGE (règle b) fournissent des candidats — jamais
 *      un lien automatique, quelle que soit leur unanimité (voir l'en-tête du fichier) ;
 *   ④ rien du tout : `sans_candidat`. Le mail va quand même dans la file, avec la mention qu'il n'y a rien à
 *      proposer — un mail qu'aucun écran ne montre est un mail perdu.
 */
export function examinerMessage(o: {
  messageId: number;
  /** Toutes les adresses du fil, celles du mail comprises. Chacune porte le message d'où elle vient. */
  adressesEchange: readonly AdresseEchange[];
}): Examen {
  const duMail = o.adressesEchange.filter((a) => a.messageId === o.messageId);
  const vueMail = vueDesAdresses(duMail);
  const utiles = adressesUtiles(duMail).length;

  const certain = cibleCertaine(vueMail);
  if (certain !== null) {
    return {
      issue: 'automatique',
      certain: {
        cible: certain.cible, regle: 'a', confiance: 'haute',
        motif: `adresses du mail : ${certain.motif}`,
        adresses: listerAdresses(certain.adresses),
      },
      candidats: [],
      adressesUtiles: utiles,
      motif: `adresses du mail : ${certain.motif}`,
    };
  }

  const candidatsMail = candidatsDeLaVue(vueMail, 'a', 'haute', 'adresses du mail');
  if (candidatsMail.length > 0) {
    return {
      issue: 'a_trier', certain: null, candidats: candidatsMail, adressesUtiles: utiles,
      motif: `adresses du mail : ${vueMail.lots.size} logement(s) et ${vueMail.proprietaires.size} propriétaire(s)`
        + ' — aucune lecture unique',
    };
  }

  // ── LE MAIL SEUL NE DIT RIEN : on regarde tout l'échange, et on ne fabrique QUE des candidats ────────────────
  const vueEchange = vueDesAdresses(o.adressesEchange);
  const candidatsEchange = candidatsDeLaVue(vueEchange, 'b', 'moyenne', 'adresses de l’échange');
  if (candidatsEchange.length > 0) {
    return {
      issue: 'a_trier', certain: null, candidats: candidatsEchange, adressesUtiles: utiles,
      motif: 'aucune adresse connue dans ce mail ; l’échange, lui, en porte — à confirmer à la main',
    };
  }

  /**
   * 🔴 DEUX RAISONS TRÈS DIFFÉRENTES DE N'AVOIR AUCUN CANDIDAT, et les confondre serait mentir.
   *
   * MESURÉ À LA PREMIÈRE SIMULATION du 26/09/2026 : le rapport annonçait « aucune adresse connue de l'annuaire »
   * sur des mails où il venait lui-même de compter UNE adresse reconnue. La contradiction sautait aux yeux, et elle
   * cachait le cas le plus intéressant du lot — celui d'un locataire PARTI. Son adresse est bien à l'annuaire, mais
   * aucun bail ne couvre la date du mail : il est reconnu, et il ne désigne aucun logement. C'est exactement ce que
   * la trace des adresses est faite pour dire, et c'est une information, pas un trou.
   */
  return {
    issue: 'sans_candidat', certain: null, candidats: [], adressesUtiles: utiles,
    motif: utiles === 0
      ? 'aucune adresse de l’échange n’est connue de l’annuaire'
      : `${utiles} adresse(s) reconnue(s), mais aucune ne désigne de logement ni de propriétaire`
        + ' à la date du mail (bail hors période, ou lot hors gestion)',
  };
}

/** Comment une issue se dit à l'écran. PUR. */
export function libelleIssue(i: Issue): string {
  if (i === 'automatique') return 'rattaché automatiquement';
  if (i === 'a_trier') return 'à trier';
  return 'aucun candidat';
}

/** Les statuts d'un lien VIVANT — ceux que l'index d'unicité surveille, et que le bandeau affiche. */
export const STATUTS_VIVANTS = ['propose', 'confirme'] as const;
export type Statut = 'propose' | 'confirme' | 'rejete' | 'retire';

/** Un statut est-il vivant ? PUR. */
export function estVivant(s: Statut): boolean {
  return s === 'propose' || s === 'confirme';
}

/**
 * L'ÉTAT OÙ REVENIR POUR DÉFAIRE le geste qui a produit `s`, ou `null` quand il n'y a rien à défaire. PUR.
 *
 * 🔴 TOUT EST RÉVERSIBLE, et la réversibilité est un geste à part entière : `retire` revient à `confirme`,
 * `confirme` se défait en `retire`, `rejete` revient à `propose`. Ce qui se fait d'un clic se défait d'un clic.
 *
 * ⚠️ `propose` REND `null`, ET C'EST VOULU. C'est l'état de DÉPART que pose le moteur, pas le résultat d'un clic :
 * prétendre le défaire obligerait à inventer un cinquième statut (« non proposé ») qui ne signifierait rien. Seule
 * la paire `confirme` / `retire` est donc strictement réciproque.
 */
export function statutInverse(s: Statut): Statut | null {
  if (s === 'retire') return 'confirme';
  if (s === 'rejete') return 'propose';
  if (s === 'confirme') return 'retire';
  return null;   // un candidat proposé n'a rien à défaire : on le confirme ou on le rejette
}
