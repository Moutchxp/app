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
}): Examen {
  const utiles = adressesUtiles(o.adressesEchange.filter((a) => a.messageId === o.messageId)).length;

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
    })),
    textes: o.textes,
    biens: o.biens,
  });

  /** Une proposition de bien, traduite dans le vocabulaire des rattachements. La cible est TOUJOURS un lot. */
  const enCandidat = (p: PropositionBien): Candidat => ({
    cible: cibleLot(p.cle),
    // La règle dit D'OÙ vient la conclusion : (a) et (b) du mail, (c) et (d) d'un arbitrage à faire.
    regle: p.cas === 'a' || p.cas === 'b' ? 'a' : p.cas,
    confiance: p.certitude === 'quasi_certaine' ? 'haute' : 'moyenne',
    motif: p.motif,
    adresses: p.adresses,
  });

  if (examen.issue === 'automatique') {
    return {
      issue: 'automatique',
      certain: enCandidat(examen.propositions[0]),
      candidats: [],
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
