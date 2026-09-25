/**
 * MODULE « GESTION » — LOT ANNUAIRE-1 : COMPRENDRE CE QU'ON TAPE. Module PUR et CLIENT-SAFE (aucun import, aucune
 * base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL CHAMP, PARCE QU'ON NE SAIT PAS D'AVANCE CE QU'ON CHERCHE. Demande d'Arno : « trouver par nom, adresse,
 * téléphone ou mail qui est qui par rapport à un logement ». Quatre champs obligeraient à décider AVANT de taper
 * dans lequel on est — alors qu'on a sous les yeux un numéro sans savoir s'il est d'un propriétaire ou d'un
 * locataire. C'est donc ce module qui regarde ce qui a été tapé et en déduit TOUTES les lectures possibles ; la
 * requête les essaie toutes et fond les résultats.
 *
 * 🔴 UN TÉLÉPHONE SE TAPE COMME ON VEUT. « 06 32 79 39 24 », « 06.32.79.39.24 », « 0632793924 », « +33632793924 »
 * et « 33 6 32 79 39 24 » doivent trouver la même personne. On en tire DEUX lectures : la forme E.164 exacte quand
 * le numéro est complet, et la SUITE DE CHIFFRES quand il est partiel (« 79 39 24 » = une fin de numéro, que l'on
 * cherche en fin de chaîne). Sans la seconde, chercher les quatre derniers chiffres ne rendrait rien — et c'est
 * pourtant ainsi qu'on cherche un numéro qu'on a sous les yeux.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { normaliserEmail, normaliserTelephone, normaliserTexte } from './annuaire';

/** En deçà, une recherche rendrait la moitié de l'annuaire : on préfère ne rien chercher et le dire. */
export const LONGUEUR_MINIMALE = 2;
/** Au-delà, ce n'est plus une recherche, c'est un copier-coller accidentel. Tronqué, jamais refusé. */
export const LONGUEUR_MAXIMALE = 120;
/** Il faut au moins ce nombre de chiffres pour qu'une suite de chiffres soit lue comme un bout de téléphone. */
export const CHIFFRES_MINIMUM_TELEPHONE = 4;

export interface TermeRecherche {
  /** Ce qui a été tapé, borné en longueur. Sert à réafficher, jamais à interroger. */
  brut: string;
  /** La forme normalisée (minuscules, sans accent) : c'est elle qui interroge les colonnes `*_normalise`. */
  texte: string;
  /** Les mots du texte. Chercher « rue puvis » doit trouver « 54 avenue Puvis de Chavannes ». */
  mots: string[];
  /** Le numéro complet en E.164, quand c'en est un. */
  telephone: string | null;
  /** La suite de chiffres tapée, pour retrouver une FIN de numéro. `null` s'il y en a trop peu. */
  chiffres: string | null;
  /** L'e-mail complet, quand c'en est un. */
  email: string | null;
  /** Un identifiant de lot WIPPIMMO, quand on a tapé un nombre court et rien d'autre. */
  numeroLot: string | null;
  /** Rien d'exploitable : trop court, ou vide. L'écran le DIT au lieu de rendre une liste vide sans raison. */
  vide: boolean;
}

/**
 * ANALYSE CE QUI A ÉTÉ TAPÉ. PUR.
 *
 * ⚠️ TOUTES LES LECTURES SONT CUMULÉES, jamais exclusives : « 12 rue de la Paix » est à la fois du texte et un
 * nombre. Décider qu'un terme est « un téléphone DONC pas un nom » ferait disparaître les entreprises dont le nom
 * contient des chiffres, et les adresses, qui commencent toutes par un numéro.
 */
export function analyserTerme(brut: string | null | undefined): TermeRecherche {
  const coupe = (brut ?? '').slice(0, LONGUEUR_MAXIMALE).trim();
  const texte = normaliserTexte(coupe);
  const chiffresBruts = coupe.replace(/\D/g, '');

  const vide = coupe.length < LONGUEUR_MINIMALE;
  return {
    brut: coupe,
    texte,
    mots: texte.split(' ').filter((m) => m.length >= 2),
    telephone: normaliserTelephone(coupe),
    chiffres: chiffresBruts.length >= CHIFFRES_MINIMUM_TELEPHONE ? chiffresBruts : null,
    email: coupe.includes('@') ? normaliserEmail(coupe) : null,
    // Un nombre SEUL et court est un identifiant de lot ; « 54 avenue… » n'en est pas un (il y a autre chose).
    numeroLot: /^\d{1,6}$/.test(coupe) ? coupe : null,
    vide,
  };
}

/**
 * LE MOTIF DE L'ÉCRAN quand la recherche ne rend rien — et il DIT ce qui a été cherché.
 *
 * « Aucun résultat » tout court laisse croire à une panne. Ici, on rappelle les quatre entrées possibles : celui
 * qui cherche comprend qu'il a peut-être tapé un nom de rue quand il fallait un nom de personne.
 */
export function messageRechercheVide(t: TermeRecherche): string {
  if (t.vide) return `Tapez au moins ${LONGUEUR_MINIMALE} caractères : un nom, une adresse, un téléphone ou un e-mail.`;
  return `Aucun propriétaire, lot ou locataire ne correspond à « ${t.brut} ». `
    + 'La recherche porte sur les noms, les adresses, les communes, les téléphones, les e-mails et les numéros de lot.';
}

/** Un titre de groupe de résultats : le LOGEMENT d'abord, parce que c'est par lui qu'on cherche. PUR. */
export function titreLogement(adresse: string | null, commune: string | null): string {
  const bouts = [adresse, commune].map((x) => (x ?? '').trim()).filter((x) => x !== '');
  return bouts.length === 0 ? 'Adresse non renseignée' : bouts.join(', ');
}

/** « du 12/03/2019 », « jusqu'au 04/01/2024 », « depuis le … » — les dates dites en français, jamais en ISO. PUR. */
export function formaterDateIso(iso: string | null | undefined): string {
  const s = (iso ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`;
}

/** L'occupation d'un lot, dite en une ligne. PUR — testée, et employée par les trois fiches. */
export function periodeOccupation(entree: string | null, sortie: string | null): string {
  const e = formaterDateIso(entree);
  const s = formaterDateIso(sortie);
  if (e === '' && s === '') return 'dates inconnues';
  if (s === '') return `depuis le ${e}`;
  if (e === '') return `jusqu’au ${s}`;
  return `du ${e} au ${s}`;
}
