/**
 * MODULE « GESTION » — LOT DRIVE-1 : LE MOTEUR DE TRI DES PIÈCES JOINTES. Module PUR (aucune base, aucun réseau,
 * aucune horloge) — donc éprouvable règle par règle, et rejouable à l'identique sur les mêmes données.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE NE RANGE RIEN. Il DÉCIDE, et il dit POURQUOI : une destination, la règle qui l'a produite, un niveau
 * de confiance. Au lot DRIVE-1 ces décisions ne servent qu'à un rapport à blanc ; c'est le lot suivant qui copiera.
 * Séparer les deux est ce qui permet à Arno de relire 26 000 décisions AVANT qu'un seul octet ne bouge.
 *
 * 🔴 L'ORDRE DES RÈGLES EST CELUI D'ARNO, ET IL N'EST PAS NÉGOCIABLE :
 *   a. LES ADRESSES E-MAIL D'ABORD. C'est la seule clé qui ne mente pas : un nom peut être porté par deux
 *      personnes, une adresse postale par dix lots, mais une adresse e-mail désigne quelqu'un.
 *   b. LE MÊME ÉCHANGE. Un mail sans correspondance hérite du rattachement majoritaire des autres mails de son fil :
 *      une pièce jointe envoyée en réponse appartient au même dossier que la question.
 *   c. LES RENFORTS, seulement si a et b ont échoué : la carte d'événement, puis l'adresse d'un lot citée dans le
 *      texte, puis un nom. Dans CET ordre, du plus sûr au moins sûr.
 *   d. SINON « 00 Non rattachés / AAAA / MM ». Et c'est une réponse, pas un échec : une pièce qu'on ne sait pas
 *      classer doit être RETROUVABLE, pas devinée.
 *
 * 🔴 AUCUN TRI AUTOMATIQUE VERS « Travaux », « Assurances » ou « Litige ». Ces trois-là demandent de comprendre le
 * CONTENU d'un document, ce qu'aucune règle mécanique ne sait faire. Tout arrive dans un « En attente » ou dans
 * « 00 Non rattachés » — d'où un humain le déplacera en sachant ce qu'il fait.
 *
 * 🔴 ON NE TRANCHE JAMAIS AU JUGÉ. Deux correspondances qui se contredisent ne donnent pas « la première » : elles
 * donnent le propriétaire commun s'il existe, et « 00 Non rattachés » sinon.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { normaliserEmail, normaliserTexte } from './annuaire';

// ── CE QUE LE MOTEUR REÇOIT ───────────────────────────────────────────────────────────────────────────────────────

export interface PieceATrier {
  pieceId: number;
  messageId: number;
  filId: number | null;
  /** Date du message, en ISO. C'est elle qui décide QUI occupait le bien. */
  date: string;
  sens: 'recu' | 'envoye';
  expediteur: string;
  /** À + Cc réunis. Le Cci n'est pas une clé : on ne sait pas s'il a été lu. */
  destinataires: readonly string[];
  objet: string;
  /** Les premiers milliers de caractères suffisent : une adresse citée l'est en tête. */
  corps: string;
  /** L'adresse portée par la carte d'événement du fil, quand il y en a une. */
  evenementAdresse?: string | null;
  /** La pièce a-t-elle vraiment ses octets chez nous ? Sinon elle est listée à part, jamais « perdue ». */
  stockee: boolean;
}

export interface ContactAnnuaireTri {
  email: string;
  role: 'proprietaire' | 'locataire';
  /** Identifiant interne du propriétaire ou du locataire dans l'annuaire. */
  sujetId: number;
}

export interface OccupationTri {
  locataireId: number;
  /** Clé WIPPIMMO du lot. `null` quand le bail vise un lot hors gestion. */
  lotCle: string | null;
  proprietaireCle: string | null;
  entree: string | null;
  sortie: string | null;
}

export interface LotTri {
  cle: string;
  proprietaireCle: string | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
}

export interface ProprietaireTri {
  id: number;
  cle: string;
  nomNormalise: string;
  /** Les clés WIPPIMMO de ses lots. */
  lots: readonly string[];
}

export interface LocataireTri {
  id: number;
  nomNormalise: string;
}

export interface AnnuaireTri {
  contacts: readonly ContactAnnuaireTri[];
  occupations: readonly OccupationTri[];
  lots: readonly LotTri[];
  proprietaires: readonly ProprietaireTri[];
  locataires: readonly LocataireTri[];
  /** Nos propres adresses E-MAIL, qui ne sont JAMAIS une clé de rattachement. */
  adressesMaison: readonly string[];
  /**
   * 🔴 NOS PROPRES ADRESSES POSTALES, qui ne sont pas une clé non plus — et pour exactement la même raison.
   *
   * MESURÉ le 26/09/2026 sur les 26 811 pièces réelles : l'adresse de l'agence figure dans la SIGNATURE de chaque
   * mail sortant. Comme un lot géré se trouve à cette adresse, la règle c.2 la reconnaissait dans le corps et y
   * envoyait **1 853 pièces** — soit 49 % de tout ce que la règle c rattachait, et toutes à tort. La signature
   * d'un mail ne dit pas de quoi il parle : elle dit qui l'envoie.
   *
   * Un lot situé à l'une de ces adresses reste dans l'arborescence et garde son dossier ; il ne peut simplement
   * pas être rattaché PAR SON ADRESSE. Ses mails passent par les adresses e-mail (règle a) ou par l'échange
   * (règle b), et tombent sinon en « 00 Non rattachés » — d'où on les récupère, au lieu de les croire classés.
   */
  adressesPostalesMaison?: readonly string[];
}

// ── CE QUE LE MOTEUR REND ─────────────────────────────────────────────────────────────────────────────────────────

export type Destination =
  | { sorte: 'bien'; cle: string }
  | { sorte: 'proprietaire'; cle: string }
  | { sorte: 'non_rattache'; annee: string; mois: string };

export type Regle = 'a' | 'b' | 'c' | 'd';
export type Confiance = 'haute' | 'moyenne' | 'basse';

export interface Decision {
  pieceId: number;
  messageId: number;
  destination: Destination;
  regle: Regle;
  /** Le détail de la règle, en français : « adresse d'un locataire », « adresse citée dans l'objet »… */
  motif: string;
  confiance: Confiance;
  stockee: boolean;
}

// ── LES DOMAINES QUI NE SONT JAMAIS UNE CLÉ ───────────────────────────────────────────────────────────────────────

/**
 * 🔴 NOS PROPRES ADRESSES NE RATTACHENT RIEN. `gestion@` est expéditeur ou destinataire de presque tous les mails :
 * s'en servir comme clé rattacherait tout au même endroit. Le partenaire interne ADHOC (comptabilité externalisée)
 * est exclu pour la même raison — il n'est ni propriétaire ni locataire, il est des deux côtés de tous les dossiers.
 */
export const DOMAINES_MAISON = ['criterimmo.fr', 'sansvisavis.com'] as const;

export function estAdresseMaison(adresse: string, maison: readonly string[]): boolean {
  const a = (normaliserEmail(adresse) ?? '').trim();
  if (a === '') return true;   // une adresse illisible ne rattache rien non plus
  if (maison.some((m) => (normaliserEmail(m) ?? m.toLowerCase()) === a)) return true;
  const domaine = a.slice(a.indexOf('@') + 1);
  return DOMAINES_MAISON.some((d) => domaine === d || domaine.endsWith(`.${d}`));
}

/** Les adresses qui SERVENT DE CLÉ pour ce mail : l'expéditeur si reçu, les destinataires si envoyé. PUR. */
export function adressesCles(p: PieceATrier, maison: readonly string[]): string[] {
  const brutes = p.sens === 'recu' ? [p.expediteur] : [...p.destinataires];
  const vues = new Set<string>();
  const out: string[] = [];
  for (const b of brutes) {
    const a = normaliserEmail(b);
    if (a === null || estAdresseMaison(a, maison) || vues.has(a)) continue;
    vues.add(a);
    out.push(a);
  }
  return out;
}

// ── RÈGLE a — LES ADRESSES ────────────────────────────────────────────────────────────────────────────────────────

/** Une date ISO tombe-t-elle dans la période d'un bail ? Une entrée inconnue ne borne rien, une sortie non plus. */
export function occupeALaDate(o: OccupationTri, date: string): boolean {
  const d = date.slice(0, 10);
  if (o.entree !== null && d < o.entree.slice(0, 10)) return false;
  if (o.sortie !== null && d > o.sortie.slice(0, 10)) return false;
  return true;
}

/** Le propriétaire commun à plusieurs biens, s'il existe. `null` dès qu'ils divergent. PUR. */
export function proprietaireCommun(lots: readonly (string | null)[]): string | null {
  const vus = new Set(lots.filter((x): x is string => x !== null));
  return vus.size === 1 ? [...vus][0] : null;
}

interface Piste { destination: Destination; motif: string; confiance: Confiance }

function pisteDepuisLocataire(
  locataireId: number, date: string, annuaire: AnnuaireTri,
): Piste | null {
  const siennes = annuaire.occupations.filter((o) => o.locataireId === locataireId && o.lotCle !== null);
  if (siennes.length === 0) return null;

  const aLaDate = siennes.filter((o) => occupeALaDate(o, date));
  if (aLaDate.length === 1) {
    return {
      destination: { sorte: 'bien', cle: aLaDate[0].lotCle as string },
      motif: 'adresse d’un locataire, et il occupait ce bien à la date du mail',
      confiance: 'haute',
    };
  }
  if (aLaDate.length > 1) {
    // Il occupait PLUSIEURS biens ce jour-là : on ne choisit pas. Leur propriétaire commun, sinon rien.
    const commun = proprietaireCommun(aLaDate.map((o) => o.proprietaireCle));
    if (commun !== null) {
      return {
        destination: { sorte: 'proprietaire', cle: commun },
        motif: `adresse d’un locataire occupant ${aLaDate.length} biens à cette date — rangé chez leur propriétaire commun`,
        confiance: 'moyenne',
      };
    }
    return null;   // contradiction irréductible : l'appelant enverra en « 00 Non rattachés »
  }

  // Aucune occupation à cette date : le mail est antérieur à l'entrée, ou postérieur à la sortie. On retient sa
  // DERNIÈRE occupation connue, et on baisse la confiance — c'est une supposition, elle doit se voir.
  const derniere = [...siennes].sort((a, b) => (b.entree ?? '').localeCompare(a.entree ?? ''))[0];
  return {
    destination: { sorte: 'bien', cle: derniere.lotCle as string },
    motif: 'adresse d’un locataire, mais aucun bail en cours à la date du mail — rangé sur sa dernière occupation',
    confiance: 'basse',
  };
}

function pisteDepuisProprietaire(proprietaireId: number, annuaire: AnnuaireTri): Piste | null {
  const p = annuaire.proprietaires.find((x) => x.id === proprietaireId);
  if (p === undefined) return null;
  if (p.lots.length === 1) {
    return {
      destination: { sorte: 'bien', cle: p.lots[0] },
      motif: 'adresse d’un propriétaire qui n’a qu’un seul bien',
      confiance: 'haute',
    };
  }
  return {
    destination: { sorte: 'proprietaire', cle: p.cle },
    motif: p.lots.length === 0
      ? 'adresse d’un propriétaire sans bien en gestion'
      : `adresse d’un propriétaire qui a ${p.lots.length} biens — rangé chez lui`,
    confiance: p.lots.length === 0 ? 'moyenne' : 'haute',
  };
}

/** Deux destinations désignent-elles la même chose ? PUR. */
export function memeDestination(a: Destination, b: Destination): boolean {
  if (a.sorte !== b.sorte) return false;
  if (a.sorte === 'non_rattache' && b.sorte === 'non_rattache') return a.annee === b.annee && a.mois === b.mois;
  return (a as { cle: string }).cle === (b as { cle: string }).cle;
}

/**
 * RÈGLE a — les adresses, et elles seules. `null` si aucune adresse du mail n'est connue de l'annuaire.
 *
 * 🔴 PLUSIEURS CORRESPONDANCES QUI SE CONTREDISENT NE DONNENT PAS « LA PREMIÈRE ». On cherche le propriétaire
 * commun ; à défaut, on renvoie une contradiction, que l'appelant range en « 00 Non rattachés ». Choisir au jugé
 * mettrait la quittance d'un locataire dans le dossier d'un autre propriétaire, et personne ne s'en apercevrait.
 */
export function reglerParAdresse(p: PieceATrier, annuaire: AnnuaireTri): Piste | { contradiction: true } | null {
  const cles = adressesCles(p, annuaire.adressesMaison);
  if (cles.length === 0) return null;

  const pistes: Piste[] = [];
  for (const adresse of cles) {
    for (const c of annuaire.contacts.filter((x) => x.email === adresse)) {
      const piste = c.role === 'locataire'
        ? pisteDepuisLocataire(c.sujetId, p.date, annuaire)
        : pisteDepuisProprietaire(c.sujetId, annuaire);
      if (piste !== null) pistes.push(piste);
      else if (c.role === 'locataire') return { contradiction: true };
    }
  }
  if (pistes.length === 0) return null;
  if (pistes.length === 1) return pistes[0];

  const premiere = pistes[0];
  if (pistes.every((x) => memeDestination(x.destination, premiere.destination))) return premiere;

  // Contradictions : le propriétaire commun de tous les biens visés, sinon rien.
  const proprietaires = pistes.map((x) => {
    const d = x.destination;
    if (d.sorte === 'bien') return annuaire.lots.find((l) => l.cle === d.cle)?.proprietaireCle ?? null;
    if (d.sorte === 'proprietaire') return d.cle;
    return null;
  });
  const commun = proprietaireCommun(proprietaires);
  if (commun === null) return { contradiction: true };
  return {
    destination: { sorte: 'proprietaire', cle: commun },
    motif: 'plusieurs adresses connues, qui désignent des biens d’un même propriétaire',
    confiance: 'moyenne',
  };
}

// ── RÈGLE c — LES RENFORTS ────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'adresse d'un lot est-elle CITÉE dans ce texte ? Rapprochement normalisé sur le NUMÉRO + un mot de VOIE
 * distinctif + le code postal ou la commune. Jamais approché : les trois éléments doivent y être.
 *
 * ⚠️ POURQUOI TROIS CONDITIONS. « 54 » tout seul apparaît partout ; « avenue Puvis de Chavannes » sans numéro
 * désigne quinze lots ; le code postal seul désigne une ville. Les trois ensemble désignent un immeuble — et si
 * plusieurs lots partagent cet immeuble, l'appelant traite la contradiction comme ailleurs.
 */
const MOTS_VOIE = new Set(['rue', 'avenue', 'av', 'bd', 'boulevard', 'allee', 'impasse', 'chemin', 'route',
  'place', 'quai', 'cours', 'square', 'villa', 'passage', 'sentier', 'residence', 'res', 'de', 'du', 'des',
  'la', 'le', 'les', 'bis', 'ter']);

export function adresseCitee(lot: LotTri, texteNormalise: string): boolean {
  const adresse = normaliserTexte(lot.adresse ?? '');
  if (adresse === '') return false;
  const jetons = adresse.split(' ').filter((x) => x !== '');
  const numero = jetons.find((x) => /^\d+$/.test(x));
  if (numero === undefined) return false;
  const distinctifs = jetons.filter((x) => !/^\d+$/.test(x) && !MOTS_VOIE.has(x) && x.length >= 4);
  if (distinctifs.length === 0) return false;

  const mots = new Set(texteNormalise.split(' '));
  if (!mots.has(numero)) return false;
  if (!distinctifs.every((d) => mots.has(d))) return false;

  const cp = normaliserTexte(lot.codePostal ?? '');
  const commune = normaliserTexte(lot.commune ?? '');
  const lieuCite = (cp !== '' && mots.has(cp))
    || (commune !== '' && commune.split(' ').every((c) => mots.has(c)));
  return lieuCite;
}

/** Un nom de personne est-il cité dans ce texte ? Exige tous les mots du nom, et au moins un de 5 lettres. PUR. */
export function nomCite(nomNormalise: string, motsTexte: ReadonlySet<string>): boolean {
  const mots = nomNormalise.split(' ').filter((x) => x.length >= 3);
  if (mots.length === 0 || !mots.some((m) => m.length >= 5)) return false;
  return mots.every((m) => motsTexte.has(m));
}

/**
 * Les lots dont l'adresse PEUT servir de clé : tous, sauf ceux qui sont à une adresse à nous (cf.
 * `adressesPostalesMaison`). PUR.
 */
export function lotsRapprochablesParAdresse(annuaire: AnnuaireTri): LotTri[] {
  const maison = (annuaire.adressesPostalesMaison ?? []).map((a) => normaliserTexte(a)).filter((a) => a !== '');
  if (maison.length === 0) return [...annuaire.lots];
  return annuaire.lots.filter((l) => {
    const a = normaliserTexte(l.adresse ?? '');
    return a === '' ? true : !maison.some((m) => a === m || a.startsWith(`${m} `) || m.startsWith(`${a} `));
  });
}

function reglerParRenforts(p: PieceATrier, annuaire: AnnuaireTri): Piste | { contradiction: true } | null {
  const rapprochables = lotsRapprochablesParAdresse(annuaire);

  // c.1 — LA CARTE D'ÉVÉNEMENT du fil : son adresse a été saisie par un humain, c'est la plus sûre des trois.
  const adresseEvt = normaliserTexte(p.evenementAdresse ?? '');
  if (adresseEvt !== '') {
    const vises = rapprochables.filter((l) => adresseCitee(l, adresseEvt));
    const piste = depuisLots(vises, annuaire, 'adresse de la carte d’événement de l’échange', 'moyenne');
    if (piste !== null) return piste;
  }

  // c.2 — UNE ADRESSE DE LOT CITÉE dans l'objet ou le corps (les mails MONGA entrent par là).
  const texte = normaliserTexte(`${p.objet} ${p.corps}`);
  if (texte !== '') {
    const vises = rapprochables.filter((l) => adresseCitee(l, texte));
    const piste = depuisLots(vises, annuaire, 'adresse d’un bien citée dans l’objet ou le corps', 'moyenne');
    if (piste !== null) return piste;
  }

  // c.3 — UN NOM dans l'OBJET seulement. Le corps contient des signatures, des citations, des pieds de page :
  //   y chercher un nom rattacherait un mail à qui n'en est que le témoin.
  const motsObjet = new Set(normaliserTexte(p.objet).split(' '));
  const proprios = annuaire.proprietaires.filter((x) => nomCite(x.nomNormalise, motsObjet));
  if (proprios.length === 1) {
    const seul = proprios[0];
    return seul.lots.length === 1
      ? { destination: { sorte: 'bien', cle: seul.lots[0] }, motif: 'nom du propriétaire dans l’objet (un seul bien)', confiance: 'basse' }
      : { destination: { sorte: 'proprietaire', cle: seul.cle }, motif: 'nom du propriétaire dans l’objet', confiance: 'basse' };
  }
  const locs = annuaire.locataires.filter((x) => nomCite(x.nomNormalise, motsObjet));
  if (locs.length === 1) {
    const piste = pisteDepuisLocataire(locs[0].id, p.date, annuaire);
    if (piste !== null) return { ...piste, motif: 'nom du locataire dans l’objet', confiance: 'basse' };
  }
  if (proprios.length > 1 || locs.length > 1) return { contradiction: true };
  return null;
}

function depuisLots(
  vises: readonly LotTri[], annuaire: AnnuaireTri, motif: string, confiance: Confiance,
): Piste | { contradiction: true } | null {
  if (vises.length === 0) return null;
  if (vises.length === 1) return { destination: { sorte: 'bien', cle: vises[0].cle }, motif, confiance };
  const commun = proprietaireCommun(vises.map((l) => l.proprietaireCle));
  if (commun === null) return { contradiction: true };
  return {
    destination: { sorte: 'proprietaire', cle: commun },
    motif: `${motif} — ${vises.length} biens à cette adresse, rangé chez leur propriétaire commun`,
    confiance: 'basse',
  };
}

// ── LE TRI COMPLET, EN TROIS PASSES ───────────────────────────────────────────────────────────────────────────────

/** « 00 Non rattachés / AAAA / MM » — la destination de ce qu'on ne sait pas classer. Retrouvable, jamais devinée. */
export function nonRattache(date: string): Destination {
  const d = /^(\d{4})-(\d{2})/.exec(date);
  return { sorte: 'non_rattache', annee: d?.[1] ?? 'date inconnue', mois: d?.[2] ?? '00' };
}

/**
 * TRIE TOUTES LES PIÈCES. PUR.
 *
 * ⚠️ TROIS PASSES, ET L'ORDRE COMPTE. La règle b (l'échange) a besoin du résultat de la règle a sur LES AUTRES
 * mails du même fil : elle ne peut donc pas s'évaluer pièce par pièce en un seul parcours. On applique donc a
 * partout, puis b sur ce qui reste, puis c et d.
 */
export function trierPieces(pieces: readonly PieceATrier[], annuaire: AnnuaireTri): Decision[] {
  const parPiece = new Map<number, Decision>();
  /** Ce que la règle a a trouvé, par fil : sert à la règle b. */
  const parFil = new Map<number, Destination[]>();

  // ── PASSE 1 : LES ADRESSES ──────────────────────────────────────────────────────────────────────────────────
  const restantes: PieceATrier[] = [];
  for (const p of pieces) {
    const piste = reglerParAdresse(p, annuaire);
    if (piste === null) { restantes.push(p); continue; }
    if ('contradiction' in piste) {
      parPiece.set(p.pieceId, {
        pieceId: p.pieceId, messageId: p.messageId, destination: nonRattache(p.date), regle: 'a',
        motif: 'plusieurs adresses connues qui désignent des dossiers différents — non tranché',
        confiance: 'basse', stockee: p.stockee,
      });
      continue;
    }
    parPiece.set(p.pieceId, {
      pieceId: p.pieceId, messageId: p.messageId, destination: piste.destination, regle: 'a',
      motif: piste.motif, confiance: piste.confiance, stockee: p.stockee,
    });
    if (p.filId !== null) {
      const l = parFil.get(p.filId) ?? [];
      l.push(piste.destination);
      parFil.set(p.filId, l);
    }
  }

  // ── PASSE 2 : LE MÊME ÉCHANGE ───────────────────────────────────────────────────────────────────────────────
  const encoreRestantes: PieceATrier[] = [];
  for (const p of restantes) {
    const voisines = p.filId === null ? undefined : parFil.get(p.filId);
    const majoritaire = voisines === undefined ? null : destinationMajoritaire(voisines);
    if (majoritaire === null) { encoreRestantes.push(p); continue; }
    parPiece.set(p.pieceId, {
      pieceId: p.pieceId, messageId: p.messageId, destination: majoritaire.destination, regle: 'b',
      motif: `hérité des ${majoritaire.compte} autres mails de l’échange, rattachés au même dossier`,
      confiance: 'moyenne', stockee: p.stockee,
    });
  }

  // ── PASSE 3 : LES RENFORTS, PUIS « 00 NON RATTACHÉS » ───────────────────────────────────────────────────────
  for (const p of encoreRestantes) {
    const piste = reglerParRenforts(p, annuaire);
    if (piste !== null && !('contradiction' in piste)) {
      parPiece.set(p.pieceId, {
        pieceId: p.pieceId, messageId: p.messageId, destination: piste.destination, regle: 'c',
        motif: piste.motif, confiance: piste.confiance, stockee: p.stockee,
      });
      continue;
    }
    parPiece.set(p.pieceId, {
      pieceId: p.pieceId, messageId: p.messageId, destination: nonRattache(p.date), regle: 'd',
      motif: piste === null
        ? 'aucune adresse connue, aucun voisin dans l’échange, aucune adresse ni aucun nom reconnu'
        : 'plusieurs renforts qui se contredisent — non tranché',
      confiance: 'basse', stockee: p.stockee,
    });
  }

  return pieces.map((p) => parPiece.get(p.pieceId)).filter((d): d is Decision => d !== undefined);
}

/**
 * La destination MAJORITAIRE d'un fil. `null` s'il y a égalité — une majorité qui n'en est pas une ne décide de
 * rien, et le mail continue vers les renforts.
 */
export function destinationMajoritaire(
  destinations: readonly Destination[],
): { destination: Destination; compte: number } | null {
  if (destinations.length === 0) return null;
  const paquets: { destination: Destination; compte: number }[] = [];
  for (const d of destinations) {
    const trouve = paquets.find((x) => memeDestination(x.destination, d));
    if (trouve) trouve.compte += 1;
    else paquets.push({ destination: d, compte: 1 });
  }
  paquets.sort((a, b) => b.compte - a.compte);
  if (paquets.length > 1 && paquets[0].compte === paquets[1].compte) return null;
  return paquets[0];
}

/** Le chemin lisible d'une destination, pour le rapport. PUR. */
export function cheminDestination(d: Destination, nomsBiens: ReadonlyMap<string, string>, nomsProps: ReadonlyMap<string, string>): string {
  if (d.sorte === 'non_rattache') return `00 Non rattachés/${d.annee}/${d.mois}`;
  if (d.sorte === 'bien') return `2 Biens immobiliers/${nomsBiens.get(d.cle) ?? `lot ${d.cle}`}/En attente`;
  return `1 Propriétaires/${nomsProps.get(d.cle) ?? `propriétaire ${d.cle}`}/En attente`;
}
