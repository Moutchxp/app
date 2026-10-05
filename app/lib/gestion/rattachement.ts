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
// LOT AFFECTATION-PAR-BIEN — la cible d'un classement est TOUJOURS un bien : le moteur de ce lot est le seul.
import { proposerBiens, type BienConnu, type PropositionBien, type TextesDuMail } from './propositionsBien';
// 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — l'annuaire des personnes citées dans un texte. Module PUR.
import type { AnnuaireContenu } from './personnesDansLeTexte';
// 🔴🔴 LOT DOCUMENTS-HORS-BIENS — « ce mail est-il un de nos envois automatiques ? ». Module PUR.
import { estDocumentEnvoye } from './documentsAuto';

/**
 * LES SORTES DE CIBLE QU'UNE LIGNE DE `gestion_rattachement` PEUT PORTER, à la LECTURE.
 *
 * 🔴 `proprietaire` EST UNE SORTE D'HISTOIRE, PAS D'ÉCRITURE. 19 555 lignes la portent (toutes RETIRÉES depuis le
 * rattrapage du 28/09 au soir) et doivent rester LISIBLES : les retirer du type ferait disparaître ces lignes de
 * l'écran sans les avoir corrigées. Aucune voie ne peut plus les écrire — voir `SORTES_RATTACHEMENT_PERMISES`.
 *
 * ⚠️ `locataire` N'A JAMAIS EXISTÉ EN BASE : la contrainte `gestion_rattachement_sorte_chk` (migration 257) ne l'a
 * jamais admise, et le compte est de 0 ligne. Elle figure ici — et dans les refus — parce que d'autres parties du
 * module la nomment (`statutClassement.SORTES_BIEN`, le SQL de `classementBien`) et qu'Arno l'a explicitement
 * visée : « aucune voie ne peut plus créer un lien propriétaire OU LOCATAIRE direct ». Interdire une chose qui
 * n'est pas arrivée coûte une ligne ; l'oublier le jour où quelqu'un élargit la contrainte coûte un dossier client.
 */
export type CibleSorte = 'lot' | 'proprietaire' | 'locataire' | 'evenement';

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
/**
 * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — UNE CIBLE D'HISTORIQUE, PAS DE RATTACHEMENT.
 *
 * ⚠️ UN LOCATAIRE N'EST TOUJOURS PAS UNE CIBLE DE RATTACHEMENT, et `SORTES_RATTACHEMENT_PERMISES` ne l'accueille
 * pas. Il déménage ; le logement, non — c'est la règle centrale du module, et ce point ne l'entame pas d'un cran.
 * Ce qu'Arno a demandé est un POINT DE LECTURE : « l'historique par locataire, sur le modèle de l'historique
 * propriétaire ». On ne POSE rien sur une personne ; on RASSEMBLE ce qui la concerne, et seulement pendant qu'elle
 * occupait les lieux.
 */
export function cibleLocataire(cle: string): Cible { return { sorte: 'locataire', cle, id: null }; }
export function cibleEvenement(id: number): Cible { return { sorte: 'evenement', cle: null, id }; }

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FICHE-RATTACHEMENT — LA LISTE BLANCHE DES CIBLES, ET POURQUOI ELLE EST ICI ET NULLE PART AILLEURS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE DÉFAUT QU'ELLE FERME, constaté par Arno le 28/09/2026 au soir. Le mail « modification adresse mail »
   d'Isabelle MENN (19:41) portait « BIEN(S) RATTACHÉ(S) : PROPRIÉTAIRE BALIABINE épouse MENN Isabelle (234) ».
   Un nom de personne annoncé comme un bien rattaché — exactement la règle abandonnée le matin même.

   🔴 LA CAUSE N'ÉTAIT PAS DANS LE CODE SUR LE DISQUE, ET C'EST TOUTE LA LEÇON. Le code de la relève appelait déjà
   `proposerBiens`, qui ne rend que des lots. Mais le PROCESSUS de relève continue tournait depuis le 27/09 à
   16h41 — soit AVANT la conversion du 28/09 à 14h26 — et exécutait, minute après minute, l'ancien moteur chargé
   en mémoire. 17 liens « propriétaire » sont nés ainsi entre 15h23 et 23h11.

   ⇒ D'OÙ CETTE LISTE, ET LE GARDE-FOU DE BASE QUI L'ACCOMPAGNE (migration 273). Un garde écrit en TypeScript ne
   protège que le code qu'on vient de charger ; il ne peut rien contre un processus qui tourne depuis la veille.
   Seule une contrainte dans la base arrête les deux. Les deux existent donc, et disent la même chose.

   🔴 L'ÉVÉNEMENT RESTE UNE CIBLE, et ce n'est pas une exception à la règle : une carte d'événement n'est pas une
   PERSONNE, c'est un dossier de travail. La règle d'Arno vise les personnes — « on ne range pas un litige chez un
   propriétaire » —, pas les cartes.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES SEULES SORTES DE CIBLE QU'UN RATTACHEMENT PEUT PORTER, par quelque voie que ce soit. PUR.
 *
 * ⚠️ `proprietaire` RESTE DANS LE TYPE `CibleSorte`, et c'est délibéré : 19 555 lignes historiques la portent et
 * doivent rester LISIBLES. On n'efface pas le passé, on cesse d'en écrire.
 */
export const SORTES_RATTACHEMENT_PERMISES: readonly CibleSorte[] = ['lot', 'evenement'];

/** Cette sorte peut-elle être écrite aujourd'hui ? PUR. */
export function sortePermise(sorte: string): boolean {
  return (SORTES_RATTACHEMENT_PERMISES as readonly string[]).includes(sorte);
}

/**
 * LE MOTIF DU REFUS, EN TOUTES LETTRES, écrit UNE fois.
 *
 * 🔴 IL DIT QUOI FAIRE À LA PLACE. Un refus qui se contente d'interdire laisse devant un écran bloqué ; celui-ci
 * nomme le geste juste — rattacher le BIEN — et rappelle que le propriétaire en découle tout seul.
 */
export function motifSorteRefusee(sorte: string): string {
  const quoi = sorte === 'proprietaire' ? 'un propriétaire' : sorte === 'locataire' ? 'un locataire' : `« ${sorte} »`;
  return `Un mail ne se rattache pas à ${quoi} : la cible d’un classement est toujours un BIEN. `
    + 'Choisissez le logement concerné — son propriétaire et son locataire à la date du mail en découlent, '
    + 'et n’ont donc rien à saisir.';
}

/** Les adresses UTILISABLES comme clé : ni les nôtres, ni celles que l'annuaire ne connaît pas. PUR. */
export function adressesUtiles(adresses: readonly AdresseEchange[]): AdresseEchange[] {
  return adresses.filter((a) => !a.interne && a.reconnaissance.partie !== null);
}

/** Les adresses, dédoublonnées, dans l'ordre de rencontre. Un même correspondant écrit souvent plusieurs fois. */
function listerAdresses(adresses: readonly AdresseEchange[]): string[] {
  return [...new Set(adresses.map((a) => a.adresse))];
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT AFFECTATION-PAR-BIEN — CE QUI A ÉTÉ RETIRÉ ICI, ET POURQUOI
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   `vueDesAdresses`, `cibleCertaine` et `candidatsDeLaVue` vivaient ici. Elles portaient une règle qu'Arno a
   explicitement abandonnée le 28/09/2026 : proposer un PROPRIÉTAIRE comme cible de classement. Elles ne sont pas
   remplacées par un équivalent — elles sont remplacées par `proposerBiens`, qui répond à la même question dans le
   bon vocabulaire (« quels BIENS ? », jamais « quelle personne ? »).

   Elles n'ont pas été laissées en place « au cas où » : une fonction morte qui encode l'ancienne règle est une
   invitation à la réintroduire, et le jour où quelqu'un l'appellera, le rapport annoncera de nouveau
   « PROPRIÉTAIRE MARTY Jean-François » sans que personne ne comprenne d'où ça sort.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

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
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — LE CATALOGUE DES BIENS. OBLIGATOIRE, et ce n'est pas une lourdeur : sans lui, on
   * ne peut pas savoir si un propriétaire n'a qu'UN bien (cas b, automatique) ou plusieurs (cas c, à trancher).
   * C'est exactement la distinction que ce lot introduit ; la rendre facultative rouvrirait l'ancien comportement
   * par une porte de service.
   */
  biens: readonly BienConnu[];
  /** L'objet, le corps et les noms de pièces : la matière des cas (c) et (d). Absents ⇒ ces cas ne jouent pas. */
  textes?: TextesDuMail;
  /**
   * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — L'ANNUAIRE DES PERSONNES, pour le cas (e). Absent ⇒ le cas ne joue
   * pas : un appelant qui ne le passe pas obtient EXACTEMENT le comportement d'avant ce lot.
   */
  contenu?: AnnuaireContenu;
  /**
   * 🔴🔴 LOT DOCUMENTS-HORS-BIENS — LE SENS ET L'EXCLUSION DU MAIL, pour reconnaître nos envois automatiques.
   * Absents ⇒ le garde ne joue pas, et le moteur se comporte EXACTEMENT comme avant ce lot.
   */
  sens?: string | null;
  exclusionRegleId?: number | null;
  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 4 — LA MARQUE « INTERNE », ET LE CHEMIN QU'ELLE FERME ════════
   *
   * Le verdict du module pur `interneDuMail` : marque par mail vivante, sinon marque retirée, sinon marque de
   * l'échange. On ne refait pas la règle ici, on la REÇOIT.
   *
   * ═══ 🔴🔴 LE CHEMIN QUI CONTOURNAIT LA RÈGLE, ET COMMENT JE L'AI TROUVÉ ═════════════════════════════════════
   *
   * Le module CROYAIT arbitrer le conflit « un bien ET interne » : `leverInterneApresRattachement` est écrite
   * pour LEVER la marque quand un bien est rattaché — « un rattachement l'emporte sur Interne ».
   *
   * ⚠️ CORRECTION DU 04/10/2026 (lot PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE) : **cette fonction n'a jamais eu
   * d'appelant.** Vérifié sur tout le dépôt et depuis son commit d'origine (68f8a254) : seule sa jumelle
   * `leverHorsGestionApresRattachement` est câblée. L'arbitrage décrit ici n'a donc jamais tourné, et mon
   * encadré d'origine l'affirmait à tort. Rattacher un bien à un mail interne laisse aujourd'hui les deux états
   * vivants. Signalé à Arno comme une décision à prendre.
   *
   * 🔴 LE TROU QUE CE PARAMÈTRE FERME RESTE ENTIER, ET IL EST MÊME PLUS LARGE QUE JE NE L'AVAIS ÉCRIT : la passe
   * AUTOMATIQUE ne regardait pas la marque, et personne ne levait la marque derrière elle. Elle pouvait donc
   * poser un bien confirmé sur un mail qu'Arno venait de marquer « interne », sans arbitrage et sans trace.
   * L'état interdit naissait en silence.
   *
   * 🔴 MESURÉ, PAS SUPPOSÉ (04/10/2026) : le mail 57433 de l'échange 36665 — marqué « interne » par Arno le
   * 03/10 à 15:37 — rendait encore `issue=automatique, certain=448` quand on le repassait au moteur. Le chemin
   * était ouvert, et il l'était pour tout mail à venir de ces 9 échanges.
   *
   * ⚠️ CE REFUS NE TOUCHE PAS LE GESTE HUMAIN. Rattacher un bien à la main reste permis, et lève la marque comme
   * avant : l'arbitrage reste possible, il reste simplement RÉSERVÉ À QUELQU'UN. Absent ⇒ le moteur se comporte
   * exactement comme avant ce lot.
   */
  interne?: boolean;
}): Examen {
  const utiles = adressesUtiles(o.adressesEchange.filter((a) => a.messageId === o.messageId)).length;

  /**
   * 🔴🔴 UN MAIL MARQUÉ « INTERNE » N'A PAS DE BIEN, ET LE REFUS EST ICI — AVANT TOUT CALCUL. Comme pour les
   * documents envoyés juste en dessous : le mail n'est pas ambigu, il est HORS SUJET. Refuser en amont évite
   * aussi d'écrire une ligne d'examen « à trier » qui ferait réapparaître ces échanges dans la file.
   *
   * ⚠️ `sans_candidat` ET NON « a_trier » : rien n'est à trancher. Un mail interne ne devient pas le courrier
   * d'un logement parce qu'une adresse de l'échange en désigne un.
   */
  if (o.interne === true) {
    return {
      issue: 'sans_candidat', certain: null, candidats: [], adressesUtiles: utiles,
      motif: 'mail marqué « interne » par une personne : il ne concerne aucun bien',
    };
  }

  /**
   * ══ 🔴🔴 UN « Document CRITERIMMO » QUE NOUS AVONS ENVOYÉ N'A JAMAIS DE BIEN ═══════════════════════════════════
   *
   * RÈGLE D'ARNO (01/10/2026) : « Les “Document CRITERIMMO” concernent des PERSONNES, pas le bien. […] JAMAIS dans
   * la fiche d'un bien, ni dans “Vie du bien”, ni dans aucun historique ou compteur de bien. »
   *
   * 🔴 LE REFUS EST ICI, AVANT TOUT CALCUL, et c'est voulu : `proposerBiens` trouverait l'adresse du locataire et
   * conclurait très légitimement à son logement. Le mail n'est pas ambigu — il est HORS SUJET. Refuser en amont
   * évite aussi d'écrire une ligne d'examen « à trier » qui ferait apparaître 33 000 documents dans la file.
   *
   * ⚠️ `sans_candidat` ET NON « automatique » : le document ne va dans la file de tri d'aucun bien, et il
   * n'apparaît donc avec AUCUNE proposition pré-cochée — la dernière phrase du point 3 d'Arno.
   *
   * ⚠️ CELA NE CONCERNE QUE NOS ENVOIS. Une RÉPONSE humaine à un document est du vrai courrier client : elle
   * repasse par le moteur normalement et garde ses biens. C'est `estDocumentEnvoye` qui tient la différence.
   */
  if (estDocumentEnvoye({ sens: o.sens, objet: o.textes?.objet, exclusionRegleId: o.exclusionRegleId })) {
    return {
      issue: 'sans_candidat', certain: null, candidats: [], adressesUtiles: utiles,
      motif: 'document automatique envoyé par l’agence : il se range dans une fiche, jamais dans un bien',
    };
  }

  /**
   * 🔴 UN SEUL MOTEUR, ET C'EST LE MODULE PUR `proposerBiens`. L'écran de classement, la file de tri et cette
   * passe automatique appellent tous la même fonction : sans cela, le rapport annoncerait un classement et
   * l'écriture en ferait un autre — le pire défaut possible, puisque le rapport est justement ce qu'on relit AVANT
   * d'autoriser l'écriture.
   */
  const examen = proposerBiens({
    adresses: o.adressesEchange.map((a) => ({
      adresse: a.adresse,
      interne: a.interne,
      partie: a.reconnaissance.partie,
      lotCle: a.reconnaissance.lotCle,
      proprietaireCle: a.reconnaissance.proprietaireCle,
      duMail: a.messageId === o.messageId,
      /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — les biens où cette adresse porte une carte de contact. */
      cartesLots: a.cartesLots,
    })),
    textes: o.textes,
    biens: o.biens,
    contenu: o.contenu,
  });

  /** Une proposition de bien, traduite dans le vocabulaire des rattachements. La cible est TOUJOURS un lot. */
  const enCandidat = (p: PropositionBien): Candidat => ({
    cible: cibleLot(p.cle),
    // La règle dit D'OÙ vient la conclusion : (a) et (b) du mail, (c) et (d) d'un arbitrage à faire,
    //   (e) une personne NOMMÉE dans le texte — la plus faible des six, et elle ne coche jamais rien ;
    //   (f) une CARTE DE CONTACT rattache cette adresse à ce bien (lot HISTORIQUE-BIEN-6, point 1).
    regle: p.cas === 'a' || p.cas === 'b' ? 'a' : p.cas,
    /**
     * 🔴 (f) EST DE CONFIANCE **BASSE**, comme (e), et pour la même raison : elle part d'un INDICE sur la
     * personne, pas d'une identité du logement. Une carte dit « cette personne parle de ce bien » ; le mail
     * qu'on classe peut concerner un autre bien du même propriétaire. La proposition se voit, motivée, et
     * attend un humain — c'est la leçon des 76 cases cochées du cas (d).
     */
    confiance: p.cas === 'e' || p.cas === 'f'
      ? 'basse'
      : p.certitude === 'quasi_certaine' ? 'haute' : 'moyenne',
    motif: p.motif,
    adresses: p.adresses,
  });

  if (examen.issue === 'automatique') {
    /**
     * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — UN LIEN CERTAIN N'EFFACE PAS LES PROPOSITIONS DE CONTENU.
     *
     * Elles portent sur une AUTRE personne que celle qui écrit (le motif d'un virement nomme un locataire que
     * l'expéditeur — la banque — ne connaît pas). Les jeter au motif qu'un bien est certain ferait perdre la
     * seule indication qu'un mail de tiers porte parfois. Elles restent donc, en PROPOSITIONS décochées, à côté
     * du lien confirmé.
     */
    return {
      issue: 'automatique',
      certain: enCandidat(examen.propositions.find((p) => p.cas !== 'e') ?? examen.propositions[0]),
      candidats: examen.propositions.filter((p) => p.cas === 'e').map(enCandidat),
      adressesUtiles: utiles,
      motif: examen.motif,
    };
  }
  if (examen.issue === 'a_trancher') {
    return {
      issue: 'a_trier', certain: null, candidats: examen.propositions.map(enCandidat),
      adressesUtiles: utiles, motif: examen.motif,
    };
  }
  return { issue: 'sans_candidat', certain: null, candidats: [], adressesUtiles: utiles, motif: examen.motif };
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — « QU'EST-CE QU'UN BIEN RATTACHÉ À UN MAIL ? », ÉCRIT UNE FOIS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (04/10/2026), après l'audit HISTORIQUE-DES-BIENS : « Arno est d'accord pour réunir la règle en un
   seul code (sqlLiensDuBien lu par la fenêtre “Visualiser / Modifier”, l'historique du bien, l'historique
   propriétaire), À CONDITION qu'il ne voie STRICTEMENT AUCUN changement, ni fonctionnel ni graphique. »

   ═══ 🔴🔴 CE QUE L'AUDIT AVAIT TROUVÉ, ET QUE CE FRAGMENT FERME ═══════════════════════════════════════════════════

   Les écrans lisaient la MÊME table en écrivant la MÊME règle à PLUSIEURS endroits :
     · la fenêtre  : `statut IN ('propose','confirme') AND cible_sorte = 'lot' AND cible_cle IS NOT NULL` ;
     · l'historique: `statut = 'confirme' AND cible_sorte = 'lot' AND cible_cle = ANY(...) AND piece_id IS NULL`.

   🔴 ET IL Y EN AVAIT UN QUATRIÈME, QUE LE TEST DE GARDE A TROUVÉ : `dossierDuBienRepo.biensDuMail`, qui alimente
   la fenêtre Drive (« Ranger une pièce dans le Drive » → « Dossier du bien »). Arno n'en avait nommé que trois ;
   celui-là écrivait la règle à la main lui aussi, sans `piece_id`. Je l'ai replié sur le fragment plutôt que de
   l'exempter : un garde avec une liste d'exemptions ne garde rien — il suffirait d'y inscrire son fichier.

   Elles concordaient — 0 écart sur 11 706 couples (mail, bien) — mais PAR ACCIDENT HEUREUX : la fenêtre ne
   filtrait pas `piece_id`. Le premier lien confirmé posé sur une pièce jointe les aurait fait diverger en
   silence, sans qu'aucun test ne s'en aperçoive. C'est cette divergence DORMANTE que le fragment supprime.

   ⚠️ ET SA FERMETURE EST PROUVABLEMENT INVISIBLE : mesuré le 04/10/2026, `gestion_rattachement` ne contient
   **AUCUNE** ligne avec `piece_id` non nul — 0 sur 172 472. Ajouter cette condition à la fenêtre ne change donc
   pas une seule ligne de son résultat, aujourd'hui. C'est ce qui permet de tenir la condition d'Arno tout en
   réparant le fond.

   ═══ 🔴 CE QUE LE FRAGMENT NE PREND PAS EN CHARGE, ET POURQUOI ═══════════════════════════════════════════════════

     · LE CIBLAGE (`cible_cle = ANY(...)`) reste chez l'appelant : « quel bien je regarde » n'est pas « qu'est-ce
       qu'un bien rattaché ». Les mêler aurait obligé le fragment à connaître les numéros de paramètres de chaque
       requête, c'est-à-dire à devenir illisible pour éviter une duplication qui n'existe pas.
     · LES AXES « propriétaire » ET « carte » de l'historique gardent leur propre condition : ce ne sont pas des
       biens. Les faire passer par ce fragment aurait voulu dire qu'un nom de personne est un bien — alors que
       l'invariant du module est justement « une cible de rattachement est TOUJOURS un bien (ou une carte) ».

   ⚠️ `avecPropositions` EST UN PARAMÈTRE, ET CE N'EST PAS UNE CONCESSION. La fenêtre a BESOIN des propositions :
   son panneau « Modifier les biens rattachés » les propose à cocher. Ce qu'elle AFFICHE, en revanche, est réduit
   aux liens confirmés par le module pur `biensDuMail`. Les deux écrans affichent donc bien la même chose ; ils ne
   LISENT pas la même chose, et c'est voulu.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LE PRÉDICAT SQL D'UN LIEN DE BIEN. PUR (une chaîne, aucun paramètre lié).
 *
 * `alias` est l'alias de `gestion_rattachement` dans la requête appelante.
 *
 * ⚠️ AUCUNE VALEUR N'EST INTERPOLÉE ICI — seulement un alias que l'appelant écrit en dur dans son propre source.
 * Un fragment qui accepterait une valeur serait une porte d'injection, et ce module est lu par tout le dépôt.
 */
export function sqlLiensDuBien(alias: string, o: { avecPropositions?: boolean } = {}): string {
  const statut = o.avecPropositions === true
    ? `${alias}.statut IN ('propose', 'confirme')`
    : `${alias}.statut = 'confirme'`;
  return `${statut} AND ${alias}.cible_sorte = 'lot' AND ${alias}.cible_cle IS NOT NULL`
    + ` AND ${alias}.piece_id IS NULL`;
}
