/**
 * MODULE « GESTION » — LOT AFFECTATION-PAR-BIEN : QUELS BIENS CE MAIL PEUT-IL CONCERNER ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE, DEMANDÉE PAR ARNO LE 28/09/2026 : LA CIBLE D'UN CLASSEMENT EST TOUJOURS UN BIEN.
 *
 * Le défaut qu'elle corrige, sur un cas réel : le mail « Contestation de la retenue de 450 € sur dépôt de garantie »
 * (Comptabilité ADHOC, 28/09 13:30) proposait « PROPRIÉTAIRE MARTY Jean-François (310) ». Ce n'est pas une réponse :
 * on ne range pas un litige de dépôt de garantie « chez un propriétaire », on le range dans LE LOGEMENT dont le
 * dépôt est contesté. Un propriétaire n'est pas un dossier — c'est une PARTIE d'un dossier.
 *
 * 🔴 LE PROPRIÉTAIRE ET LE LOCATAIRE SONT DÉRIVÉS, JAMAIS SAISIS. Rattacher un bien entraîne, à l'affichage et dans
 * l'historique, son propriétaire et son locataire EN PLACE À LA DATE DU MAIL. Il n'y a donc plus rien à saisir de
 * ce côté, et plus aucune façon de se tromper de couple : la base d'occupations fait foi.
 *
 * ═══ LES CINQ CAS, DANS L'ORDRE DE FIABILITÉ (le motif est affiché en clair, toujours) ═══════════════════════════
 *   (a) une adresse de LOCATAIRE est dans l'échange           → SON bien (occupé à la date du mail). Quasi certain.
 *   (b) une adresse de PROPRIÉTAIRE qui n'a QU'UN bien        → ce bien. Quasi certain.
 *   (c) une adresse de PROPRIÉTAIRE qui a PLUSIEURS biens     → TOUS ses biens, à cocher, AUCUN pré-coché…
 *                                                               …sauf si l'adresse ou le n° de lot de l'un d'eux est
 *                                                               cité dans l'objet, le corps ou le nom d'une pièce.
 *   (d) aucune adresse reconnue                               → les biens dont l'adresse ou le n° de lot est cité.
 *   (e) NOS adresses (gestion@, la maison, la compta externalisée) ne servent JAMAIS de clé — mais les adresses
 *       TIERCES qu'elles citent (copie, transfert, corps) restent pleinement utilisables.
 *
 * 🔴 PLUSIEURS BIENS SE COCHENT DANS TOUS LES CAS. Un mail parle parfois de deux appartements du même bailleur — un
 * appel de fonds, un relevé de charges. Rien ici ne limite un mail à un bien.
 *
 * 🔴 CE QUI DEVIENT « AUTO » EST STRICTEMENT (a) ET (b), ET RIEN D'AUTRE. Un rattachement automatique est une
 * décision que personne ne relit : il ne se pose que lorsqu'il n'existe qu'UNE lecture possible. Dans les cas (c) et
 * (d), le moteur PROPOSE et l'humain tranche — c'est un clic contre une erreur silencieuse dans l'historique d'un
 * client, et le second coûte infiniment plus cher.
 *
 * Aucune base, aucun React : tous les cas se rejouent ici sans rien brancher.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
// 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — le corps d'un mail traîne l'échange entier derrière lui : citations et
//   signature de l'agence sont retirées AVANT qu'on y cherche un bien. Module PUR lui aussi.
import { texteNonCite } from './texteCite';
// 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — qui le texte nomme-t-il ? Module PUR lui aussi.
import {
  biensAMontrer, motifDuContenu, personnesDansLeTexte, BIENS_MONTRES, type AnnuaireContenu,
} from './personnesDansLeTexte';

/** Un bien de la gestion, réduit à ce qui permet de le proposer et de le reconnaître dans un texte. */
export interface BienConnu {
  /** La clé WIPPIMMO du lot : la seule identité qui survive à un ré-import de l'annuaire. */
  cle: string;
  /** Le n° de lot lisible, tel qu'on l'écrit dans un mail (« lot 445 »). Souvent identique à la clé. */
  numero: string | null;
  adresse: string | null;
  commune: string | null;
  proprietaireCle: string | null;
  proprietaireNom: string | null;
}

/** Une adresse vue dans le mail ou dans l'échange, avec ce que l'annuaire en dit À LA DATE DU MAIL. */
export interface AdresseVue {
  adresse: string;
  /** 🔴 Nos adresses : écartées comme SOURCE (cas e). Elles restent dans la liste, on ne les efface pas. */
  interne: boolean;
  partie: 'locataire' | 'proprietaire' | null;
  lotCle: string | null;
  proprietaireCle: string | null;
  /** Vient-elle du mail lui-même, ou d'un autre message de l'échange ? Le mail prime toujours. */
  duMail: boolean;
}

/**
 * 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — (e) EST UN CINQUIÈME CAS, ET IL NE RESSEMBLE À AUCUN AUTRE. Les quatre
 * premiers partent d'une ADRESSE de l'échange ou d'une citation de BIEN ; (e) part d'une PERSONNE nommée dans le
 * texte. Il ne coche jamais rien — voir `personnesDansLeTexte`.
 */
export type CasProposition = 'a' | 'b' | 'c' | 'd' | 'e';

export interface PropositionBien {
  cle: string;
  cas: CasProposition;
  /** Le motif, EN CLAIR, tel qu'il s'affiche. Sans lui, on ne peut pas trancher sans rouvrir le code. */
  motif: string;
  /** `quasi_certaine` = cas (a) et (b) ; `a_trancher` = cas (c) et (d). */
  certitude: 'quasi_certaine' | 'a_trancher';
  /** L'écran coche cette case d'avance. Jamais silencieusement : le motif dit toujours pourquoi. */
  preCoche: boolean;
  /** Les adresses qui fondent la proposition. Vide au cas (d), qui ne vient pas d'une adresse. */
  adresses: string[];
  /**
   * 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — VRAI au-delà du cinquième bien d'une même personne (demande d'Arno :
   * « Plus de 5 biens → les 5 plus pertinents, plus “voir les autres” »). L'écran les range derrière un lien :
   * les douze lots d'un bailleur noieraient la proposition au lieu de l'éclairer.
   */
  replie?: boolean;
}

export interface ExamenBiens {
  /**
   * `automatique` = UN seul bien, par (a) ou (b) : le moteur pose le lien. `a_trancher` = des propositions, un
   * humain choisit. `sans_candidat` = on ne sait pas, et on le DIT.
   */
  issue: 'automatique' | 'a_trancher' | 'sans_candidat';
  propositions: PropositionBien[];
  motif: string;
}

/** Ce qu'on garde du corps pour y chercher : une citation d'adresse ou un nom est toujours en tête. */
export const CORPS_CHERCHABLE_MAX = 4000;

/** Les textes du mail où chercher une adresse ou un n° de lot (cas c et d). */
export interface TextesDuMail {
  objet?: string | null;
  corps?: string | null;
  /** Les noms des pièces jointes : « Quittance 12 rue Danton.pdf » désigne un bien aussi sûrement qu'un objet. */
  pieces?: readonly string[];
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA RECONNAISSANCE D'UN BIEN DANS UN TEXTE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * NORMALISER POUR COMPARER : minuscules, accents ôtés, ponctuation réduite à des espaces. PUR.
 *
 * ⚠️ ON NE COMPARE JAMAIS DEUX TEXTES BRUTS. « 12 Rue Danton » et « 12 rue danton, » sont le même lieu, et
 * « GÉRHARD » s'écrit « Gerhard » une fois sur deux dans les mails. Sans normalisation, la moitié des citations
 * passeraient à travers — et on ne le verrait pas, parce qu'une proposition manquante ne fait pas de bruit.
 */
export function normaliser(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Les mots d'une adresse qui servent à la reconnaître : le numéro, et les mots du nom de voie. PUR. */
function motsSignificatifs(adresse: string): string[] {
  const VIDES = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'allee', 'impasse', 'chemin',
    'route', 'quai', 'square', 'cours', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'bis', 'ter']);
  return normaliser(adresse).split(' ').filter((m) => m !== '' && !VIDES.has(m));
}

/**
 * 🔴 L'ADRESSE DE CE BIEN EST-ELLE CITÉE DANS CE TEXTE ? PUR.
 *
 * ⚠️ IL FAUT LE NUMÉRO **ET** LE NOM DE VOIE. « rue Danton » seul désigne toute une rue — et nous gérons parfois
 * trois immeubles dans la même. Exiger les deux évite de proposer le logement du voisin, ce qui est exactement
 * l'erreur qu'on ne veut jamais commettre dans un dossier client.
 *
 * ⚠️ UN NOM DE VOIE D'UNE SEULE LETTRE OU D'UN SEUL CHIFFRE NE COMPTE PAS : il apparaîtrait partout.
 */
export function adresseCitee(bien: BienConnu, texte: string): boolean {
  const mots = motsSignificatifs(bien.adresse ?? '');
  const numero = mots.find((m) => /^\d+$/.test(m)) ?? null;
  const voie = mots.filter((m) => !/^\d+$/.test(m) && m.length >= 3);
  if (numero === null || voie.length === 0) return false;
  const t = ` ${texte} `;
  return t.includes(` ${numero} `) && voie.every((m) => t.includes(m));
}

/**
 * 🔴 LE N° DE LOT DE CE BIEN EST-IL CITÉ ? PUR.
 *
 * ⚠️ LE NOMBRE SEUL NE SUFFIT PAS, ET C'EST ESSENTIEL. « 450 » apparaît dans « retenue de 450 € » ; un mail de
 * comptabilité est plein de nombres. On exige donc le MOT « lot » (ou « logement ») juste avant — c'est ainsi
 * qu'on l'écrit quand on le désigne vraiment.
 */
export function lotCite(bien: BienConnu, texte: string): boolean {
  const n = normaliser(bien.numero ?? bien.cle);
  if (n === '' || !/^\d+$/.test(n)) return false;
  return new RegExp(`(?:^| )(?:lot|logement|lot n|logement n) ${n}(?: |$)`).test(` ${texte} `);
}

/**
 * Le bien est-il cité, d'une façon ou d'une autre ? Et par quoi — le motif le dira. PUR.
 *
 * ══ 🔴🔴 LE N° DE LOT L'EMPORTE SUR L'ADRESSE (lot URGENT-VERIF-SUIVI-ET-76-BIENS) ════════════════════════════
 *
 * L'ordre était l'inverse, et il ne se voyait pas : les deux citations menaient au même résultat, puisque les
 * deux cochaient. Depuis que l'adresse ne coche plus, l'ordre DÉCIDE — et le mettre à l'envers aurait coûté
 * exactement le cas qui compte.
 *
 * 🔴 L'EXEMPLE QUI L'A RÉVÉLÉ, trouvé par l'épreuve « le LOT CITÉ passe devant, même au milieu de 76 » :
 * « Dépôt de garantie 54 avenue Puvis de Chavannes — lot 142 ». Les 76 lots de l'immeuble répondent à l'adresse,
 * et UN SEUL répond au numéro. Si l'adresse l'emportait, le lot 142 serait traité comme ses 75 voisins :
 * décoché, et peut-être même replié. Le mail le nommait, pourtant.
 *
 * ⚠️ UNE ADRESSE DÉSIGNE UN IMMEUBLE, UN N° DE LOT DÉSIGNE UN LOGEMENT. Entre les deux, le plus précis gagne —
 * c'est la même règle d'ordre que `proposerBiens` applique à ses cinq cas (du plus sûr au moins sûr).
 */
export function citationDuBien(bien: BienConnu, texte: string): 'adresse' | 'lot' | null {
  if (lotCite(bien, texte)) return 'lot';
  return adresseCitee(bien, texte) ? 'adresse' : null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — UNE ADRESSE CITÉE NE COCHE PLUS RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (02/10/2026), fil 193 / message 57339 « Remboursement dépôt de garantie / 54 … » : la modale
   annonçait « 76 bien(s) coché(s) sur 76 affiché(s) ». TOUS les lots du 54 avenue Puvis de Chavannes étaient
   cochés d'avance, motif « adresse cité dans le mail ».

   🔴 POURQUOI C'ÉTAIT UN DÉFAUT, ET PAS UNE SURPRISE. Une adresse citée est une proposition PAR LE CONTENU, au
   même titre que la règle (e) — et la règle absolue d'Arno, écrite au lot PROPOSITIONS-PAR-LE-CONTENU, dit :
   « Une correspondance trouvée dans le CONTENU ne rattache JAMAIS le mail automatiquement. » Ces propositions
   portaient d'ailleurs déjà `certitude: 'a_trancher'` — « à trancher » et « coché d'avance » se contredisaient.

   🔴 MESURÉ EN BASE LE 02/10/2026 : 964 mails de la file « À rattacher » avaient plus de CINQ biens cochés
   d'avance, 42 660 cases en tout, et le pire cas en comptait 109. Aucun n'avait été validé — mais un seul clic
   sur « Valider » aurait rattaché un mail à 109 logements.

   ⚠️ LE N° DE LOT, LUI, CONTINUE DE COCHER. Ce n'est pas la même information : une adresse DÉSIGNE UN IMMEUBLE
   (76 lots au 54 avenue Puvis de Chavannes), un n° de lot désigne UN LOGEMENT et un seul. Arno a nommé
   « l'adresse citée », et c'est elle seule qui change — retirer aussi le n° de lot retirerait une fonctionnalité
   qui marche, sans qu'on l'ait demandé.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * UNE CITATION COCHE-T-ELLE LA CASE ? PUR.
 *
 * Écrite ICI et nulle part ailleurs : les cas (c) et (d) la posent tous deux, et deux `if` finiraient par ne plus
 * dire la même chose — c'est exactement ce qui vient d'arriver entre `certitude` et `preCoche`.
 */
export function citationCoche(cite: 'adresse' | 'lot' | null): boolean {
  return cite === 'lot';
}

/**
 * ══ 🔴🔴 LES CINQ BIENS CITÉS LES PLUS PERTINENTS ; LES AUTRES SE REPLIENT. PUR. ══════════════════════════════
 *
 * Demande d'Arno : « si l'adresse citée correspond à PLUSIEURS lots d'un même immeuble, on ne liste pas les
 * 76 lots : […] les 5 lots les plus pertinents (n° de lot ou étage cité, locataire ou propriétaire dans
 * l'échange) + "voir les autres" ».
 *
 * 🔴 L'ORDRE DE PERTINENCE :
 *   ① le N° DE LOT est cité, lui aussi — le mail nomme CE logement, pas seulement l'immeuble ;
 *   ② le reste, dans l'ordre où l'annuaire les donne.
 *
 * ⚠️ LES DEUX AUTRES CRITÈRES D'ARNO N'ONT PAS DE PRISE ICI, ET IL FAUT LE DIRE PLUTÔT QUE DE FAIRE SEMBLANT :
 *   · « l'ÉTAGE cité » — l'annuaire ne porte aucun étage (`BienConnu` n'a ni champ, ni colonne derrière). Le
 *     deviner d'un « Type 2 » ou d'un n° de lot serait inventer une donnée ;
 *   · « le LOCATAIRE ou le PROPRIÉTAIRE dans l'échange » — ce cas (d) ne se déclenche QUE si aucune adresse
 *     reconnue n'a produit de bien (`propositions.length === 0`). Par construction, aucun bien de la liste n'a
 *     donc de partie dans l'échange : le critère ne départagerait jamais rien. Une première écriture le portait ;
 *     l'épreuve « un bien dont le propriétaire est dans l'échange » a montré qu'elle ne pouvait pas l'atteindre.
 *
 * ⚠️ LE TRI EST STABLE : à rang égal, l'ordre d'arrivée est conservé (celui de l'annuaire, trié par commune puis
 * adresse). Un tri instable ferait changer les cinq montrés d'un rechargement à l'autre, et l'on croirait la
 * liste aléatoire.
 *
 * ⚠️ `BIENS_MONTRES` EST LA MÊME CONSTANTE QUE LA RÈGLE (e) — cinq, et pour la même raison : « au-delà, la liste
 * des biens d'un bailleur noie la proposition au lieu de l'éclairer » (Arno). Deux seuils différents pour le même
 * geste seraient deux comportements à expliquer.
 */
export function biensCitesAMontrer(
  cites: readonly { cle: string; cite: 'adresse' | 'lot' }[],
): Set<string> {
  if (cites.length <= BIENS_MONTRES) return new Set(cites.map((x) => x.cle));
  return new Set(
    cites.map((x, i) => ({ x, i }))
      .sort((a, b) => (a.x.cite === 'lot' ? 0 : 1) - (b.x.cite === 'lot' ? 0 : 1) || a.i - b.i)
      .slice(0, BIENS_MONTRES)
      .map((e) => e.x.cle),
  );
}

/**
 * Tous les textes du mail, normalisés en une seule chaîne à fouiller. PUR.
 *
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LE CORPS EST D'ABORD DÉBARRASSÉ DE CE QUE SON AUTEUR N'A PAS ÉCRIT ══
 *
 * Citations, signatures de l'agence, liens : voir `texteCite`. Sans cela, NOTRE PROPRE adresse postale, citée au
 * bas de chaque réponse, désignait le lot 494 — 2 226 propositions dans la base pour cette seule raison
 * (mesuré le 01/10/2026, mail 57306 de Mme THAI).
 *
 * ⚠️ LE NETTOYAGE EST ICI, ET NON CHEZ LES APPELANTS. Trois chemins fabriquent ces textes (le classement d'un mail
 * reçu, la rédaction, la passe automatique) : en laisser un seul l'oublier, c'est rouvrir le défaut par une porte
 * de service, et personne ne le verrait — une proposition fausse ne fait pas de bruit.
 *
 * ⚠️ L'OBJET ET LES NOMS DE PIÈCES NE SONT PAS TOUCHÉS : un objet n'est jamais une citation, un nom de fichier non
 * plus.
 */
export function texteCherchable(t: TextesDuMail): string {
  return normaliser(texteDuContenu(t));
}

/**
 * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LE TEXTE NETTOYÉ, MAIS **PAS** APLATI. PUR.
 *
 * Le cas (e) a besoin de deux choses que `normaliser` détruit : les MAJUSCULES (un nom propre s'écrit avec une
 * majuscule — c'est le garde-fou des noms rares) et la PONCTUATION (l'extrait qu'on affiche doit se lire comme
 * le mail l'a écrit : « Motif : LOYER ZAHRA CHAKROUN »). Les deux fonctions partagent donc le NETTOYAGE —
 * citations, signatures de l'agence, liens — et se séparent sur la mise à plat.
 */
export function texteDuContenu(t: TextesDuMail): string {
  return [t.objet ?? '', texteNonCite(t.corps), ...(t.pieces ?? [])].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'EXAMEN
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le nom d'un bien, en une ligne, pour les motifs. PUR. */
function nomCourt(b: BienConnu): string {
  const lieu = [b.adresse, b.commune].filter((x) => x !== null && x !== '').join(', ');
  return lieu === '' ? `lot ${b.numero ?? b.cle}` : `${lieu} — lot ${b.numero ?? b.cle}`;
}

/**
 * ══ 🔴 LE MÊME NOM, SANS LE N° DE LOT (lot URGENT-VERIF-SUIVI-ET-76-BIENS) ════════════════════════════════════
 *
 * Demande d'Arno : « Le motif affiché "adresse cité dans le mail (… — lot 170)" laisse croire que le lot est
 * cité : n'affiche le n° de lot que s'il figure vraiment dans le mail. »
 *
 * ⚠️ IL RESTE UN REPLI SUR LE LOT quand on n'a ni adresse ni commune : un motif qui ne nommerait RIEN serait
 * pire que celui qu'on corrige. Mais on ne peut alors pas s'être trompé — c'est la seule chose qu'on sache dire.
 */
function nomSansLot(b: BienConnu): string {
  const lieu = [b.adresse, b.commune].filter((x) => x !== null && x !== '').join(', ');
  return lieu === '' ? `lot ${b.numero ?? b.cle}` : lieu;
}

/**
 * 🔴 LES BIENS PROPOSABLES POUR CE MAIL. PUR — aucune écriture, aucun effet : il DÉCRIT ce qu'on peut proposer.
 *
 * L'ORDRE DES CAS EST L'ORDRE DE FIABILITÉ, et il n'est pas indifférent : un bien trouvé par le locataire (a) ne
 * doit pas être noyé au milieu des huit biens du bailleur (c). Le premier motif rencontré pour un bien est celui
 * qu'on garde — c'est le plus sûr, puisqu'on descend la liste.
 */
export function proposerBiens(o: {
  /** Les adresses du mail ET de l'échange. Celles du mail portent `duMail: true`. */
  adresses: readonly AdresseVue[];
  textes?: TextesDuMail;
  /** Le catalogue des biens utiles : ceux des propriétaires vus, plus ceux que le texte pourrait citer. */
  biens: readonly BienConnu[];
  /**
   * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — L'ANNUAIRE DES PERSONNES, pour le cas (e). Absent ⇒ le cas ne joue
   * pas, et le moteur se comporte exactement comme avant ce lot.
   */
  contenu?: AnnuaireContenu;
}): ExamenBiens {
  const biensDuProprietaire = new Map<string, BienConnu[]>();
  for (const b of o.biens) {
    if (b.proprietaireCle === null || b.proprietaireCle === '') continue;
    biensDuProprietaire.set(b.proprietaireCle, [...(biensDuProprietaire.get(b.proprietaireCle) ?? []), b]);
  }

  /** 🔴 CAS (e) — NOS ADRESSES NE SONT JAMAIS UNE SOURCE. Les tierces qu'elles citent, si : elles sont dans la liste. */
  const utiles = o.adresses.filter((a) => !a.interne);
  // Le MAIL prime sur l'échange : on l'examine d'abord, et on ne descend que s'il ne dit rien.
  const duMail = utiles.filter((a) => a.duMail);

  const texte = texteCherchable(o.textes ?? {});
  const propositions: PropositionBien[] = [];
  const vus = new Set<string>();
  const ajouter = (p: PropositionBien) => { if (!vus.has(p.cle)) { vus.add(p.cle); propositions.push(p); } };

  const examinerGroupe = (groupe: readonly AdresseVue[], provenance: string) => {
    // ── (a) UNE ADRESSE DE LOCATAIRE DÉSIGNE SON BIEN ────────────────────────────────────────────────────────────
    for (const a of groupe) {
      if (a.partie !== 'locataire' || a.lotCle === null || a.lotCle === '') continue;
      ajouter({
        cle: a.lotCle, cas: 'a', certitude: 'quasi_certaine', preCoche: true,
        motif: `locataire en place à la date du mail (${a.adresse})${provenance}`,
        adresses: [a.adresse],
      });
    }

    // ── (b) et (c) — UN PROPRIÉTAIRE : UN SEUL BIEN, OU TOUS SES BIENS ──────────────────────────────────────────
    const proprios = new Map<string, string[]>();
    for (const a of groupe) {
      const cle = a.proprietaireCle;
      if (cle === null || cle === '') continue;
      /**
       * Une adresse de LOCATAIRE porte aussi la clé de son bailleur. Quand elle a DÉJÀ donné son bien en (a), on
       * s'arrête là : ouvrir toute la liste du bailleur par-dessus noierait la proposition sûre.
       *
       * ⚠️ MAIS QUAND ELLE N'A RIEN DONNÉ, ELLE COMPTE. C'est le cas d'un locataire de DEUX logements à la même
       * date : la reconnaissance ne tranche aucun lot (`lotCle` nul) et rend le bailleur commun. Sans cette
       * nuance, ce mail-là n'aurait aucune proposition du tout — alors qu'on sait parfaitement chez qui chercher.
       */
      if (a.partie === 'locataire' && a.lotCle !== null && a.lotCle !== '') continue;
      proprios.set(cle, [...(proprios.get(cle) ?? []), a.adresse]);
    }
    for (const [cle, adresses] of proprios) {
      const siens = biensDuProprietaire.get(cle) ?? [];
      const nom = siens[0]?.proprietaireNom ?? cle;
      if (siens.length === 1) {
        ajouter({
          cle: siens[0].cle, cas: 'b', certitude: 'quasi_certaine', preCoche: true,
          motif: `${nom} n’a qu’un bien en gestion${provenance}`,
          adresses,
        });
        continue;
      }
      /**
       * 🔴 CAS (c) — PLUSIEURS BIENS : ON LES PROPOSE TOUS, ET ON N'EN COCHE AUCUN. Choisir « le premier » serait
       * ranger au hasard le courrier d'un bailleur de huit lots.
       *
       * ══ 🔴🔴 LA SEULE EXCEPTION EST LE N° DE LOT, PLUS L'ADRESSE (lot URGENT-VERIF-SUIVI-ET-76-BIENS) ═══════
       * Une adresse citée désigne un IMMEUBLE, pas un logement : au 54 avenue Puvis de Chavannes, elle en désigne
       * 76. Elle PROPOSE donc, décochée, comme toute proposition par le contenu. Le n° de lot, lui, en désigne un
       * seul : il coche. Voir l'encadré de `citationCoche`.
       */
      for (const b of siens) {
        const cite = citationDuBien(b, texte);
        ajouter({
          cle: b.cle, cas: 'c', certitude: 'a_trancher', preCoche: citationCoche(cite),
          // ⚠️ L'ACCORD SUIT LE MOT : « adresse citée », « n° de lot cité ». La phrase se lit dans la modale,
          //   sous la case — une faute d'accord y est la première chose qu'on voit.
          motif: cite !== null
            ? `${cite === 'adresse' ? 'adresse citée' : 'n° de lot cité'} dans le mail `
              + `— un des ${siens.length} biens de ${nom}`
            : `un des ${siens.length} biens de ${nom}${provenance}`,
          adresses,
        });
      }
    }
  };

  examinerGroupe(duMail, '');
  /**
   * 🔴 LE MAIL N'A RIEN DIT : ON REGARDE TOUT L'ÉCHANGE — MAIS ON NE POSE JAMAIS RIEN D'OFFICE.
   *
   * C'est une règle déjà mesurée dans ce dépôt (lot RATTACHEMENT-1) et elle ne se rediscute pas : les mails que ce
   * second passage doit sauver sont ceux d'un TIERS — syndic, artisan, assureur — dont aucune adresse n'est à
   * l'annuaire. Leur rattacher d'office le logement du voisin de fil, c'est écrire dans le dossier d'un client une
   * pièce qui n'est peut-être pas la sienne, sans que personne le voie. Un clic contre une erreur invisible.
   */
  const depuisLEchange = propositions.length === 0;
  if (depuisLEchange) examinerGroupe(utiles, ' (vu ailleurs dans l’échange)');

  /**
   * ── (d) AUCUNE ADRESSE RECONNUE : LE TEXTE, ET LUI SEUL ──────────────────────────────────────────────────────
   * Les mails de comptabilité ou d'un syndic n'ont aucune adresse à l'annuaire, et citent pourtant le logement en
   * toutes lettres. C'est le dernier filet — et il ne donne JAMAIS un rattachement automatique.
   */
  if (propositions.length === 0 && texte !== '') {
    /**
     * ══ 🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — C'EST ICI QUE LES 76 CASES ÉTAIENT COCHÉES ═══════════════════
     *
     * Le fil 193 (« Remboursement dépôt de garantie / 54 … ») passe par ce cas : son expéditeur EST à l'annuaire,
     * mais son occupation ne couvre plus la date du mail — il est sorti, c'est précisément l'objet du mail. Aucun
     * bien ne vient donc des adresses, et le texte prend le relais. L'adresse « 54 avenue Puvis de Chavannes »
     * désigne 76 lots, et les 76 étaient cochés.
     *
     * 🔴 TROIS CHANGEMENTS, ET AUCUN NE RETIRE DE PROPOSITION :
     *   ① une adresse citée NE COCHE PLUS (`citationCoche`) — un n° de lot, si ;
     *   ② au-delà de cinq, les moins pertinents se REPLIENT derrière « voir les autres » (ils restent là, et se
     *      cochent) ;
     *   ③ le motif ne montre le N° DE LOT que si le mail le cite VRAIMENT (demande d'Arno : « le motif laisse
     *      croire que le lot est cité »).
     */
    const cites = o.biens
      .map((b) => ({ b, cite: citationDuBien(b, texte) }))
      .filter((x): x is { b: BienConnu; cite: 'adresse' | 'lot' } => x.cite !== null);
    const montres = biensCitesAMontrer(cites.map((x) => ({ cle: x.b.cle, cite: x.cite })));
    for (const { b, cite } of cites) {
      ajouter({
        cle: b.cle, cas: 'd', certitude: 'a_trancher', preCoche: citationCoche(cite),
        /**
         * 🔴 LE N° DE LOT N'EST ÉCRIT QUE S'IL EST CITÉ. `nomCourt` ajoute toujours « — lot N », ce qui faisait
         * lire « adresse cité dans le mail (… — lot 170) » comme si le mail nommait le lot 170. Il ne le nommait
         * pas : il nommait l'immeuble, et 76 lots y répondaient.
         */
        motif: `aucune adresse connue ; ${cite === 'adresse' ? 'adresse citée' : 'n° de lot cité'} dans le mail `
          + `(${cite === 'lot' ? nomCourt(b) : nomSansLot(b)})`
          + (cite === 'adresse' && cites.length > 1 ? ` — un des ${cites.length} lots de cette adresse` : ''),
        adresses: [],
        // Au-delà du cinquième : rangé derrière « voir les autres », comme la règle (e).
        replie: !montres.has(b.cle),
      });
    }
  }

  /**
   * ══ 🔴🔴 (e) — LE TEXTE NOMME QUELQU'UN DE L'ANNUAIRE ═══════════════════════════════════════════════════════
   *
   * DEMANDE D'ARNO (01/10/2026) : « Quand le contenu d'un mail cite une personne de l'annuaire, proposer les
   * biens de cette personne. » Cas réel : un virement du Crédit Mutuel, « Motif : LOYER ZAHRA CHAKROUN ».
   *
   * 🔴🔴 ET SA RÈGLE ABSOLUE : « Une correspondance trouvée dans le CONTENU ne rattache JAMAIS le mail
   * automatiquement. » Ces propositions sont donc TOUJOURS `a_trancher` et TOUJOURS décochées — quelle que soit
   * leur évidence apparente. Une adresse DÉSIGNE ; un nom RESSEMBLE.
   *
   * ⚠️ ELLES S'AJOUTENT, elles ne remplacent pas : « si le mail a déjà des propositions d'expéditeur (cochées),
   * celles du contenu s'ajoutent EN DESSOUS, décochées ». D'où leur place ici, après les quatre autres cas, et
   * sans la condition « si rien n'a été trouvé » qui garde le cas (d).
   *
   * ⚠️ `ajouter` ÉCARTE CE QUI EST DÉJÀ LÀ : un bien déjà proposé par son propriétaire garde SON motif, le plus
   * sûr des deux. On ne le propose pas deux fois.
   */
  const parContenu = o.contenu === undefined
    ? []
    : personnesDansLeTexte(texteDuContenu(o.textes ?? {}), o.contenu);
  for (const c of parContenu) {
    const { montres, autres } = biensAMontrer(c.personne);
    const tous = [...c.personne.lots];
    for (const cle of tous) {
      ajouter({
        cle, cas: 'e', certitude: 'a_trancher', preCoche: false,
        motif: motifDuContenu(c) + (autres > 0 && !montres.includes(cle) ? ` — un de ses ${tous.length} biens` : ''),
        adresses: [],
        // Au-delà du cinquième : rangé derrière « voir les autres ».
        replie: !montres.includes(cle),
      });
    }
  }

  if (propositions.length === 0) {
    return {
      issue: 'sans_candidat', propositions: [],
      motif: utiles.length === 0
        ? 'aucune adresse de l’échange n’est connue de l’annuaire, et le mail ne cite aucun bien'
        : `${utiles.length} adresse(s) reconnue(s), mais aucune ne désigne de bien à la date du mail `
          + '(bail hors période, ou lot hors gestion)',
    };
  }

  /**
   * 🔴 « AUTO » EXIGE UNE LECTURE UNIQUE : UN seul bien, et par (a) ou (b). Deux biens quasi certains, c'est deux
   * dossiers — et personne ne doit trancher à notre place en silence.
   */
  const quasi = propositions.filter((p) => p.certitude === 'quasi_certaine');
  /**
   * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — « AUTO » SE DÉCIDE SANS LE CONTENU, ET C'EST ESSENTIEL.
   *
   * DEUX RAISONS, et chacune suffirait :
   *   ① une correspondance de contenu ne doit JAMAIS rattacher (règle absolue d'Arno) — elle ne peut donc pas
   *      être le bien certain ;
   *   ② elle ne doit pas non plus EMPÊCHER un rattachement automatique qui existait avant ce lot. Compter les
   *      propositions de contenu dans « un seul bien certain » aurait fait basculer en « à trancher » des mails
   *      que le moteur posait tout seul depuis des mois — une fonctionnalité retirée en silence.
   */
  const parAdresse = propositions.filter((p) => p.cas !== 'e');
  if (parAdresse.length === 1 && quasi.length === 1 && !depuisLEchange) {
    return {
      issue: 'automatique', propositions,
      motif: `un seul bien certain — ${parAdresse[0].motif}`,
    };
  }

  /**
   * ⚠️ LE MOTIF DIT D'OÙ VIENNENT LES PROPOSITIONS, et le cas (e) a le sien. Sans cette ligne, un mail que SEUL
   * le contenu a sauvé s'annonçait « aucune adresse connue dans ce mail ; l'échange, lui, en porte » — ce qui
   * était faux : l'échange n'avait rien donné, c'est le TEXTE qui a nommé quelqu'un.
   */
  const queDuContenu = parAdresse.length === 0 && propositions.length > 0;
  return {
    issue: 'a_trancher', propositions,
    motif: queDuContenu
      ? `${propositions.length} bien(s) proposé(s) d’après une personne nommée dans le texte — à confirmer à la main`
      : depuisLEchange
        ? 'aucune adresse connue dans ce mail ; l’échange, lui, en porte — à confirmer à la main'
        : quasi.length > 1
          ? `${quasi.length} biens quasi certains : le mail concerne plusieurs dossiers, à trancher`
          : `${propositions.length} bien(s) proposé(s), à trancher`,
  };
}
