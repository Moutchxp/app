import { adressesUniques, composerMailLocation, prenomNom, type MailAvis, type Signature } from '../location/mailsPreavisSortie';
import type { IdentiteEnvoi } from '../location/mentionEnvoyePar';
import { dateHeure } from './digicodes';

/**
 * ══ 🔴🔴 LE CHANGEMENT DE DIGICODE : LES DESTINATAIRES ET LES MAILS (Arno, 16/11/2026, « Digicodes unifiés », lot 6). MODULE PUR. ═══════════════
 *
 * RÈGLES VALIDÉES PAR ARNO :
 *   · les LOCATAIRES EN PLACE des logements concernés (le code commun change : toute l'adresse ; un bâtiment change : ses logements), PRÉAVIS
 *     COMPRIS — un locataire qui part reçoit le mail SI la date d'application est au plus 7 JOURS après son départ (départ le 1er, changement le 7 :
 *     envoyé ; le 9 : non) ; les exclus sont DITS avec la raison (« parti le JJ/MM ») ;
 *   · « Prévenir aussi les propriétaires » (décochée par défaut) : UN mail par propriétaire, qui regroupe ses logements concernés ;
 *   · l'écran : adresse par adresse, bâtiment par bâtiment, UNE LIGNE PAR LOGEMENT (couple ou colocataires sur la même ligne), le total ;
 *   · UN MAIL PAR PERSONNE, nominatif, sans autre destinataire visible ; il ne contient QUE le code commun de son adresse et celui de SON bâtiment,
 *     avec la date et l'heure d'application ; un locataire sans e-mail : « pas d'e-mail — à prévenir autrement ».
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export interface ValeurCode { digicode: boolean | null; code: string | null }
export interface PersonneDest { id: number; nom: string; prenom: string | null; emails: string[] }
export interface LocataireDest extends PersonneDest { occupationId: number; depart: string | null; inclus: boolean; raison: string | null }
export interface LogementDest {
  lotId: number; libelle: string; batiment: string | null;
  /** 🔴 (Arno, 17/11/2026) l'étage et la porte du logement (en-tête de son bloc), s'ils sont connus */
  etage?: string | null; porte?: string | null;
  locataires: LocataireDest[]; proprietaires: PersonneDest[];
  /** les codes que portera le mail : le commun de l'adresse et celui de SON bâtiment, à la date d'application (nouveaux s'ils changent) */
  codes: { commun: ValeurCode | null; batiment: ValeurCode | null; communChange: boolean; batimentChange: boolean };
}
export interface ApercuEnvoi { adresse: string; adresseCle: string; appliqueLe: string; logements: LogementDest[];
  /** 🔴 (Arno, 17/11/2026) l'adresse de la Gestion (préférences), destinataire du mail interne */
  adresseGestion?: string }

/** 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » […] Seuls les locataires cochés reçoivent un mail […]. Ensuite, un mail à la Gestion l'informe que les locataires listés ont été prévenus. ») les deux choix. */
export type ModePrevenir = 'gestion' | 'locataires';
/** Un locataire PEUT être coché : en place (règle des 7 jours) et avec une adresse e-mail. PUR. */
export const locataireCochable = (x: LocataireDest): boolean => x.inclus && adressesUniques(x.emails).length > 0;
/** Le locataire est-il sélectionné (cochable et pas décoché) ? PUR. */
export const locataireSelectionne = (x: LocataireDest, decoches: ReadonlySet<number>): boolean => locataireCochable(x) && !decoches.has(x.occupationId);
/** « 2 logements · 3 locataires sélectionnés » : les logements qui ont au moins un locataire sélectionné, les locataires sélectionnés. PUR. */
export function totalSelection(a: ApercuEnvoi, decoches: ReadonlySet<number>): { logements: number; locataires: number; mails: number; phrase: string } {
  const sel = a.logements.map((l) => l.locataires.filter((x) => locataireSelectionne(x, decoches)));
  const logements = sel.filter((x) => x.length > 0).length;
  const locataires = sel.reduce((n, x) => n + x.length, 0);
  const mails = sel.flat().reduce((n, x) => n + adressesUniques(x.emails).length, 0);
  return { logements, locataires, mails, phrase: `${logements} logement${logements > 1 ? 's' : ''} · ${locataires} locataire${locataires > 1 ? 's' : ''} sélectionné${locataires > 1 ? 's' : ''}` };
}
/** L'en-tête d'un logement : « 7 rue … — lot 12 · bâtiment A · étage 2 · porte 21 ». PUR. */
export const enteteLogement = (l: LogementDest): string => [l.libelle, l.batiment !== null ? `bâtiment ${l.batiment}` : null,
  (l.etage ?? '').trim() !== '' ? `étage ${(l.etage as string).trim()}` : null, (l.porte ?? '').trim() !== '' ? `porte ${(l.porte as string).trim()}` : null].filter((x) => x !== null).join(' · ');

/** La date (heure de Paris) d'un instant : « AAAA-MM-JJ ». PUR. */
export const jourParis = (iso: string): string => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const jjmm = (jour: string): string => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

/** 🔴 LA RÈGLE DES 7 JOURS : un locataire qui part est prévenu si le changement s'applique au plus 7 jours après son départ. PUR. */
export function regleDepart(appliqueLe: string, depart: string | null): { inclus: boolean; raison: string | null } {
  if (depart === null) return { inclus: true, raison: null };
  const j = (x: string): number => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  const ecart = (j(jourParis(appliqueLe)) - j(depart)) / 86400000;
  return ecart <= 7 ? { inclus: true, raison: null } : { inclus: false, raison: `parti le ${jjmm(depart)}` };
}

/** Le code, en mots : « 57B83 » / « plus de digicode » / « inconnu ». PUR. */
export const motCode = (v: ValeurCode | null): string => (v === null || v.digicode === null ? 'inconnu' : v.digicode === false ? 'plus de digicode' : v.code ?? 'oui (code inconnu)');

/** Le total, les mails à envoyer et ce qui est signalé — ce que l'écran montre AVANT l'envoi. PUR. */
export function bilanEnvoi(a: ApercuEnvoi, proprietaires: boolean): { logements: number; mailsLocataires: number; mailsProprietaires: number; sansEmail: string[]; exclus: string[] } {
  const locs = a.logements.flatMap((l) => l.locataires);
  return {
    logements: a.logements.length,
    // 🔴🔴 Arno (17/11/2026 : « chaque mail de changement de digicode a exactement UNE adresse en destinataire ») : un mail PAR ADRESSE — le décompte suit
    mailsLocataires: locs.filter((x) => x.inclus).reduce((n, x) => n + adressesUniques(x.emails).length, 0),
    mailsProprietaires: proprietaires ? proprietairesRegroupes(a).reduce((n, p) => n + adressesUniques(p.personne.emails).length, 0) : 0,
    sansEmail: [...locs.filter((x) => x.inclus && adressesUniques(x.emails).length === 0).map((x) => prenomNom(x)),
      ...(proprietaires ? proprietairesRegroupes(a).filter((p) => adressesUniques(p.personne.emails).length === 0).map((p) => prenomNom(p.personne)) : [])],
    exclus: locs.filter((x) => !x.inclus).map((x) => `${prenomNom(x)} — ${x.raison}`),
  };
}

/** Les propriétaires, chacun avec SES logements concernés (un mail par propriétaire). PUR. */
export function proprietairesRegroupes(a: ApercuEnvoi): { personne: PersonneDest; logements: LogementDest[] }[] {
  const m = new Map<number, { personne: PersonneDest; logements: LogementDest[] }>();
  for (const l of a.logements) for (const p of l.proprietaires) {
    const x = m.get(p.id) ?? { personne: p, logements: [] };
    if (!x.logements.includes(l)) x.logements.push(l);
    m.set(p.id, x);
  }
  return [...m.values()];
}

const lignesCodes = (a: ApercuEnvoi, l: LogementDest): string[] => [
  ...(l.codes.commun !== null ? [`- Digicode commun (${a.adresse}) : ${motCode(l.codes.commun)}${l.codes.communChange ? '' : ' (inchangé)'}`] : []),
  ...(l.batiment !== null && l.codes.batiment !== null ? [`- Digicode du bâtiment ${l.batiment} : ${motCode(l.codes.batiment)}${l.codes.batimentChange ? '' : ' (inchangé)'}`] : []),
];

/** L'objet commun : « Changement de digicode — 12 rue … — à partir du 20/11/2026 à 09:00 ». PUR. */
export const objetChangement = (a: ApercuEnvoi): string => `Changement de digicode — ${a.adresse} — à partir du ${dateHeure(a.appliqueLe)}`;

export interface ContexteMail { expediteur: string; qui: IdentiteEnvoi; signature: Signature }

/** LE MAIL D'UN LOCATAIRE : à lui seul, à son nom ; seulement SES codes (commun de son adresse, son bâtiment). `null` : pas d'e-mail, ou exclu. PUR. */
export function mailLocataire(a: ApercuEnvoi, l: LogementDest, x: LocataireDest, c: ContexteMail): MailAvis | null {
  const dest = adressesUniques(x.emails);
  if (!x.inclus || dest.length === 0) return null;
  const paras = [`Bonjour ${prenomNom(x)},`,
    `Le digicode de votre immeuble change à partir du ${dateHeure(a.appliqueLe)}. Voici les codes valables pour votre logement à partir de cette date :\n${lignesCodes(a, l).join('\n')}`,
    'Jusqu’à cette date, le code actuel reste valable.', 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_locataire', de: c.expediteur, a: dest, cc: [], objet: objetChangement(a), texte: m.texte, html: m.html };
}

/** LE MAIL D'UN PROPRIÉTAIRE : ses logements concernés, chacun avec SES codes seulement. `null` : pas d'e-mail. PUR. */
export function mailProprietaire(a: ApercuEnvoi, p: { personne: PersonneDest; logements: LogementDest[] }, c: ContexteMail): MailAvis | null {
  const dest = adressesUniques(p.personne.emails);
  if (dest.length === 0) return null;
  const blocs = p.logements.map((l) => `${l.libelle}${l.batiment !== null ? ` (bâtiment ${l.batiment})` : ''} :\n${lignesCodes(a, l).join('\n')}`);
  const paras = [`Bonjour ${prenomNom(p.personne)},`,
    `Pour votre information, le digicode change à partir du ${dateHeure(a.appliqueLe)}. ${p.logements.length > 1 ? 'Pour vos logements' : 'Pour votre logement'} :`,
    ...blocs, 'Vos locataires en place en ont été informés.', 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_proprietaire', de: c.expediteur, a: dest, cc: [], objet: objetChangement(a), texte: m.texte, html: m.html };
}

/** Ce que l'écran dit APRÈS l'envoi : chaque mail (pour qui, parti ou non), et ce qui reste à faire autrement. */
export interface EnvoiDigicode { pour: string; objet: string; a: string[]; envoye: boolean; motif: string | null }
export interface IssueEnvoi { enregistre: boolean; envois: EnvoiDigicode[]; sansEmail: string[]; exclus: string[];
  /** 🔴 (Arno, 17/11/2026) le choix (A / B), le mail à la Gestion, les locataires décochés (non prévenus) */
  mode?: ModePrevenir; gestion?: EnvoiDigicode | null; nonCoches?: string[] }


/** L'objet du mail à la Gestion. PUR. */
export const objetGestion = (a: ApercuEnvoi, mode: ModePrevenir): string =>
  `${mode === 'gestion' ? '[À prévenir] ' : '[Locataires prévenus] '}${objetChangement(a)}`;

/**
 * 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » […] Seuls les locataires cochés reçoivent un mail […]. Ensuite, un mail à la Gestion l'informe que les locataires listés ont été prévenus. ») LE MAIL À LA GESTION (adresse des préférences ; interne : jamais un client). A : le changement, la date et la liste des logements
 * concernés, avec leurs locataires à prévenir (nom et e-mail) — la Gestion leur écrit elle-même ; B : les locataires prévenus, et ceux qui ne l'ont pas
 * été (décochés, sans e-mail, partis). `null` : pas d'adresse de Gestion. PUR.
 */
export function mailGestion(a: ApercuEnvoi, c: ContexteMail, o: { mode: ModePrevenir; decoches: ReadonlySet<number>; proprietaires: boolean }): MailAvis | null {
  const dest = adressesUniques([a.adresseGestion ?? '']);
  if (dest.length === 0) return null;
  const ligneLogement = (l: LogementDest): string => `· ${enteteLogement(l)}\n${lignesCodes(a, l).map((x) => `  ${x}`).join('\n')}`;
  const nomEtMail = (x: LocataireDest): string => `${prenomNom(x)}${adressesUniques(x.emails).length > 0 ? ` (${adressesUniques(x.emails).join(', ')})` : ''}`;
  const blocs = a.logements.map((l) => {
    const loc = l.locataires.map((x) => {
      if (!x.inclus) return `  – ${prenomNom(x)} — ${x.raison ?? 'parti'} : non concerné`;
      if (o.mode === 'gestion') return `  – ${nomEtMail(x)}${adressesUniques(x.emails).length === 0 ? ' — pas d’e-mail : à prévenir autrement' : ''}`;
      if (adressesUniques(x.emails).length === 0) return `  – ${prenomNom(x)} — pas d’e-mail : à prévenir autrement`;
      return locataireSelectionne(x, o.decoches) ? `  – ${nomEtMail(x)} — prévenu par mail` : `  – ${nomEtMail(x)} — NON prévenu (décoché)`;
    });
    return [ligneLogement(l), ...(loc.length > 0 ? loc : ['  – aucun locataire en place'])].join('\n');
  });
  const t = totalSelection(a, o.decoches);
  const paras = o.mode === 'gestion'
    ? ['Bonjour,', `Le digicode change à partir du ${dateHeure(a.appliqueLe)} — ${a.adresse}. Le changement est enregistré ; AUCUN mail n’a été envoyé aux locataires : merci de les prévenir.`,
      `Logements concernés (${a.logements.length}) :\n${blocs.join('\n')}`, 'Bien cordialement,']
    : ['Bonjour,', `Le digicode change à partir du ${dateHeure(a.appliqueLe)} — ${a.adresse}. Le changement est enregistré et les locataires listés ci-dessous comme « prévenus par mail » ont reçu chacun leur mail (${t.phrase}).${o.proprietaires ? ' Les propriétaires ont aussi été prévenus.' : ''}`,
      `Logements concernés (${a.logements.length}) :\n${blocs.join('\n')}`, 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_gestion', de: c.expediteur, a: dest, cc: [], objet: objetGestion(a, o.mode), texte: m.texte, html: m.html };
}
