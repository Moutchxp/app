import { adressesUniques, composerMailLocation, prenomNom, type MailAvis, type ParagrapheMail, type Signature } from '../location/mailsPreavisSortie';
import type { IdentiteEnvoi } from '../location/mentionEnvoyePar';
import { quandChangement } from './digicodes';

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
export interface PersonneDest { id: number; nom: string; prenom: string | null; emails: string[];
  /** 🔴 (Arno, 17/11/2026) la civilité de l'annuaire (« Bonjour Madame MARTIN, ») ; absente : inconnue */
  civilite?: string | null }
export interface LocataireDest extends PersonneDest { occupationId: number; depart: string | null; inclus: boolean; raison: string | null }
export interface LogementDest {
  lotId: number; libelle: string; batiment: string | null;
  /** 🔴 (Arno, 17/11/2026) l'étage et la porte du logement (en-tête de son bloc), s'ils sont connus */
  etage?: string | null; porte?: string | null;
  locataires: LocataireDest[]; proprietaires: PersonneDest[];
  /** les codes que portera le mail : le commun de l'adresse et celui de SON bâtiment, à la date d'application (nouveaux s'ils changent) */
  codes: { commun: ValeurCode | null; batiment: ValeurCode | null; communChange: boolean; batimentChange: boolean;
    /** 🔴 (Arno, 17/11/2026 : « Chaque code bascule à sa propre date. ») la date de chaque code qui change, et si une heure a été donnée ;
     *  absentes : la date de l'aperçu, avec son heure */
    communLe?: string; communAvecHeure?: boolean; batimentLe?: string; batimentAvecHeure?: boolean };
}
export interface ApercuEnvoi { adresse: string; adresseCle: string; appliqueLe: string; logements: LogementDest[];
  /** 🔴 (Arno, 17/11/2026) l'adresse de la Gestion (préférences), destinataire du mail interne */
  adresseGestion?: string;
  /** 🔴 (Arno, 17/11/2026) le nom de la copropriété, s'il existe (le mail à la Gestion le dit) */
  copropriete?: string | null;
  /** 🔴 (Arno, 17/11/2026 : « chaque code changé (ancien → nouveau), sa date (et heure) d'application ») les codes qui changent, place par place */
  changements?: CodeChange[] }
/** Un code qui change : sa place (« Digicode de la copropriété », « Digicode du bâtiment A »), l'ancien (en vigueur aujourd'hui), le nouveau, sa date. */
export interface CodeChange { place: string; ancien: ValeurCode | null; nouveau: ValeurCode; le: string; avecHeure: boolean }

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

/** Les changements d'un logement : chaque code qui change, sa date (instant) et sa date en mots. PUR. */
export function changementsDuLogement(a: ApercuEnvoi, l: LogementDest): { le: string; mot: string }[] {
  return [...(l.codes.communChange ? [{ le: l.codes.communLe ?? a.appliqueLe, mot: quandChangement(l.codes.communLe ?? a.appliqueLe, l.codes.communAvecHeure ?? true) }] : []),
    ...(l.codes.batimentChange ? [{ le: l.codes.batimentLe ?? a.appliqueLe, mot: quandChangement(l.codes.batimentLe ?? a.appliqueLe, l.codes.batimentAvecHeure ?? true) }] : [])];
}
/** Les dates différentes (en mots) des changements de ces logements, dans l'ordre. PUR. */
const datesDe = (a: ApercuEnvoi, ls: readonly LogementDest[]): string[] =>
  [...new Map(ls.flatMap((l) => changementsDuLogement(a, l)).sort((x, y) => x.le.localeCompare(y.le)).map((c) => [c.mot, c.le])).keys()];

/** L'en-tête de l'écran des destinataires : « nouveau code à partir du 20/11/2026 à 09:00 », ou, plusieurs dates : « nouveaux codes : copropriété à
 *  partir du 20/11/2026 à 09:00, bâtiment A à partir du 26/11/2026 ». PUR. */
export function resumeChangements(a: ApercuEnvoi): string {
  const places = new Map<string, string>();
  for (const l of a.logements) {
    if (l.codes.communChange) places.set('copropriété', quandChangement(l.codes.communLe ?? a.appliqueLe, l.codes.communAvecHeure ?? true));
    if (l.codes.batimentChange && l.batiment !== null) places.set(`bâtiment ${l.batiment}`, quandChangement(l.codes.batimentLe ?? a.appliqueLe, l.codes.batimentAvecHeure ?? true));
  }
  const dates = [...new Set(places.values())];
  return dates.length <= 1 ? `nouveau code à partir du ${dates[0] ?? quandChangement(a.appliqueLe, true)}`
    : `nouveaux codes : ${[...places].map(([p, q]) => `${p} à partir du ${q}`).join(', ')}`;
}
/** La ligne des codes d'un logement à l'écran : « copropriété C2 (20/11/2026 à 09:00) ; bâtiment A A2 (26/11/2026) ». PUR. */
export const codesEnLigne = (a: ApercuEnvoi, l: LogementDest): string =>
  `codes : copropriété ${motCode(l.codes.commun)}${l.codes.communChange ? ` (${quandChangement(l.codes.communLe ?? a.appliqueLe, l.codes.communAvecHeure ?? true)})` : ''}`
  + (l.batiment !== null ? ` ; bâtiment ${l.batiment} ${motCode(l.codes.batiment)}${l.codes.batimentChange ? ` (${quandChangement(l.codes.batimentLe ?? a.appliqueLe, l.codes.batimentAvecHeure ?? true)})` : ''}` : '');

/**
 * 🔴🔴 (Arno, 17/11/2026 : « un code par ligne (« Digicode copropriété : XXXX », « Digicode bâtiment A : XXXX ») ; la ligne « (inchangé) » est gardée en
 * dernier » ; plusieurs dates : « la date (et l'heure) au bout de chaque ligne ») Les lignes des codes d'un logement : ceux qui changent d'abord, un code
 * inchangé en dernier ; `avecDates` (plusieurs dates en jeu) : chaque code qui change dit la sienne. PUR.
 */
const lignesCodes = (a: ApercuEnvoi, l: LogementDest, avecDates = false): string[] => {
  const change: string[] = []; const inchange: string[] = [];
  const quand = (le: string | undefined, h: boolean | undefined): string => (avecDates ? `, à partir du ${quandChangement(le ?? a.appliqueLe, h ?? true)}` : '');
  if (l.codes.commun !== null) {
    if (l.codes.communChange) change.push(`Digicode de la copropriété : ${motCode(l.codes.commun)}${quand(l.codes.communLe, l.codes.communAvecHeure)}`);
    else inchange.push(`Digicode de la copropriété : ${motCode(l.codes.commun)} (inchangé)`);
  }
  if (l.batiment !== null && l.codes.batiment !== null) {
    if (l.codes.batimentChange) change.push(`Digicode du bâtiment ${l.batiment} : ${motCode(l.codes.batiment)}${quand(l.codes.batimentLe, l.codes.batimentAvecHeure)}`);
    else inchange.push(`Digicode du bâtiment ${l.batiment} : ${motCode(l.codes.batiment)} (inchangé)`);
  }
  return [...change, ...inchange];
};
/**
 * 🔴🔴 (Arno, 17/11/2026 : « après la salutation, l'adresse de la copropriété sur sa propre ligne (en gras) ; si tous les codes changent à la même date : une
 * ligne « À partir du JJ/MM/AAAA à HH:MM » (heure seulement si elle a été donnée) entre l'adresse et la liste, puis la liste sans date ; sinon, pas de ligne
 * commune, et la date (et l'heure) au bout de chaque ligne ») L'en-tête des mails : l'adresse en gras, puis la date commune s'il n'y en a qu'une. PUR.
 */
const enTete = (a: ApercuEnvoi, dates: readonly string[]): ParagrapheMail[] =>
  [{ texte: a.adresse, gras: true }, ...(dates.length <= 1 ? [`À partir du ${dates[0] ?? quandChangement(a.appliqueLe, true)}`] : [])];

/** 🔴🔴 (Arno, 17/11/2026) L'objet : « Changement des digicodes de votre immeuble — <adresse> — à partir du <première date> » (`pour` : « de votre immeuble »
 *  aux locataires, « de l'immeuble » aux propriétaires et à la Gestion) ; `logements` : ceux dont parle le mail (tous par défaut). PUR. */
export const objetChangement = (a: ApercuEnvoi, logements: readonly LogementDest[] = a.logements, pour: 'locataire' | 'autre' = 'autre'): string =>
  `Changement des digicodes ${pour === 'locataire' ? 'de votre immeuble' : 'de l’immeuble'} — ${a.adresse} — à partir du ${datesDe(a, logements)[0] ?? quandChangement(a.appliqueLe, true)}`;

/** 🔴 (Arno, 17/11/2026 : « « Bonjour <Madame / Monsieur> <NOM>, » (civilité et nom de famille ; sans civilité connue : « Bonjour <Prénom> <NOM>, ») ») PUR. */
export function bonjour(p: { nom: string; prenom: string | null; civilite?: string | null }): string {
  const c = (p.civilite ?? '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const nom = p.nom.replace(/\s+/g, ' ').trim();
  const appel = ['madame', 'mme', 'mlle', 'mademoiselle'].includes(c) ? 'Madame' : ['monsieur', 'm', 'mr'].includes(c) ? 'Monsieur'
    : ['m et mme', 'mme et m', 'monsieur et madame', 'madame et monsieur'].includes(c) ? 'Madame, Monsieur' : null;
  return `Bonjour ${appel !== null && nom !== '' ? `${appel} ${nom}` : prenomNom(p)},`;
}
const SERVICE_GESTION = 'Notre service Gestion reste à votre disposition pour toute question, par simple retour de ce mail.';
const REMERCIEMENTS = 'Nous vous remercions de votre attention et vous souhaitons une très bonne journée.';

export interface ContexteMail { expediteur: string; qui: IdentiteEnvoi; signature: Signature }

/** LE MAIL D'UN LOCATAIRE : à lui seul, à son nom ; seulement SES codes (commun de son adresse, son bâtiment). `null` : pas d'e-mail, ou exclu. PUR. */
export function mailLocataire(a: ApercuEnvoi, l: LogementDest, x: LocataireDest, c: ContexteMail): MailAvis | null {
  const dest = adressesUniques(x.emails);
  if (!x.inclus || dest.length === 0) return null;
  // 🔴🔴 (Arno, 17/11/2026 : « chaque locataire reçoit UN SEUL mail, à une seule adresse, qui regroupe tous les nouveaux codes qui le concernent (copropriété
  // + son bâtiment), chacun avec sa date (et son heure si elle existe), jamais les codes d'un autre bâtiment. »)
  const d = datesDe(a, [l]);
  // 🔴🔴 (Arno, 17/11/2026 : « MAIL DE CHANGEMENT DE DIGICODE, trop sec : réécris-le pour un être humain » — le modèle d'Arno, mot pour mot)
  const paras: ParagrapheMail[] = [bonjour(x),
    'Nous souhaitons vous informer que les codes d’accès de votre immeuble vont prochainement changer. Afin que vous puissiez continuer à accéder à votre logement sans difficulté, voici les nouveaux codes qui vous concernent :',
    ...enTete(a, d), lignesCodes(a, l, d.length > 1).join('\n'),
    `Jusqu’à ${d.length > 1 ? 'ces dates' : 'cette date'}, vos codes actuels restent valables. Pour la sécurité de tous les occupants, nous vous remercions de ne communiquer ces codes qu’aux personnes de confiance.`,
    SERVICE_GESTION, REMERCIEMENTS, 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_locataire', de: c.expediteur, a: dest, cc: [], objet: objetChangement(a, [l], 'locataire'), texte: m.texte, html: m.html };
}

/** LE MAIL D'UN PROPRIÉTAIRE : ses logements concernés, chacun avec SES codes seulement. `null` : pas d'e-mail. PUR. */
export function mailProprietaire(a: ApercuEnvoi, p: { personne: PersonneDest; logements: LogementDest[] }, c: ContexteMail): MailAvis | null {
  const dest = adressesUniques(p.personne.emails);
  if (dest.length === 0) return null;
  const d = datesDe(a, p.logements);
  const blocs = p.logements.map((l) => `${l.libelle}${l.batiment !== null ? ` (bâtiment ${l.batiment})` : ''} :\n${lignesCodes(a, l, d.length > 1).join('\n')}`);
  const paras: ParagrapheMail[] = [bonjour(p.personne),
    'Nous souhaitons vous informer que les codes d’accès vont prochainement changer dans l’immeuble où se situe votre bien. Pour votre information, voici les nouveaux codes :',
    ...enTete(a, d), ...blocs, 'Vos locataires en place en ont été informés.', SERVICE_GESTION, REMERCIEMENTS, 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_proprietaire', de: c.expediteur, a: dest, cc: [], objet: objetChangement(a, p.logements), texte: m.texte, html: m.html };
}

/** Ce que l'écran dit APRÈS l'envoi : chaque mail (pour qui, parti ou non), et ce qui reste à faire autrement. */
export interface EnvoiDigicode { pour: string; objet: string; a: string[]; envoye: boolean; motif: string | null }
export interface IssueEnvoi { enregistre: boolean; envois: EnvoiDigicode[]; sansEmail: string[]; exclus: string[];
  /** 🔴 (Arno, 17/11/2026) le choix (A / B), le mail à la Gestion, les locataires décochés (non prévenus) */
  mode?: ModePrevenir; gestion?: EnvoiDigicode | null; nonCoches?: string[] }


/**
 * ══ 🔴🔴 LA GESTION TOUJOURS PRÉVENUE (Arno, 17/11/2026) ═══════════════════════════════════════════════════════════════════════════════════════
 * « GESTION TOUJOURS PRÉVENUE, pour une MODIFICATION de digicode uniquement (jamais pour une première saisie). Deux choix, l'un OBLIGATOIRE, libellés :
 * « A. Prévenir la Gestion seulement » → la Gestion (adresse des préférences, gestion@criterimmo.fr, rien en dur) reçoit un MAIL D'ALERTE : « Digicode
 * modifié sans que les locataires aient été prévenus », avec l'adresse et le nom de la copropriété (s'il existe), chaque code changé (ancien → nouveau), sa
 * date (et heure) d'application, et la liste des logements et locataires concernés, tous marqués « non prévenu ». « B. Prévenir la Gestion et les
 * locataires » → les mails nominatifs partent (un par personne, une seule adresse), puis la Gestion reçoit : si TOUS les locataires concernés ont été
 * prévenus : un MAIL D'INFORMATION « Les digicodes de <nom de la copropriété> — <adresse> sont mis à jour à compter du <date[ heure]> ; tous les locataires
 * concernés ont été prévenus par des mails individuels. », avec les codes et la liste des locataires prévenus ; sinon (un locataire décoché, sans e-mail
 * ou en échec d'envoi) : un MAIL D'ALERTE qui le dit en objet et en tête, avec, logement par logement, les locataires PRÉVENUS et ceux NON PRÉVENUS (avec
 * la raison : décoché, pas d'e-mail, échec d'envoi). »
 * Un locataire « concerné » : en place, préavis compris selon la règle des 7 jours (`inclus`) ; un locataire parti avant n'est jamais destinataire et
 * ne compte pas parmi les non prévenus (il est dit « non concerné »).
 */
export type RaisonNonPrevenu = 'choix A' | 'décoché' | 'pas d’e-mail' | 'échec d’envoi';
/** Le sort d'un locataire concerné : prévenu, ou la raison. `resultats` : occupation → au moins un mail parti (après l'envoi). PUR. */
export function sortLocataire(x: LocataireDest, mode: ModePrevenir, decoches: ReadonlySet<number>, resultats?: ReadonlyMap<number, boolean>): { prevenu: true } | { prevenu: false; raison: RaisonNonPrevenu } {
  if (mode === 'gestion') return { prevenu: false, raison: 'choix A' };
  if (adressesUniques(x.emails).length === 0) return { prevenu: false, raison: 'pas d’e-mail' };
  if (decoches.has(x.occupationId)) return { prevenu: false, raison: 'décoché' };
  if (resultats !== undefined && resultats.get(x.occupationId) !== true) return { prevenu: false, raison: 'échec d’envoi' };
  return { prevenu: true };
}
/** Le nom du lieu : « <nom de la copropriété> — <adresse> », ou l'adresse seule. PUR. */
const lieuDe = (a: ApercuEnvoi): string => ((a.copropriete ?? '').trim() !== '' && (a.copropriete as string).trim() !== a.adresse.trim() ? `${(a.copropriete as string).trim()} — ${a.adresse}` : a.adresse);
/** La première date d'application, en mots. PUR. */
const premiereDate = (a: ApercuEnvoi): string => datesDe(a, a.logements)[0]
  ?? (a.changements !== undefined && a.changements.length > 0 ? quandChangement([...a.changements].sort((x, y) => x.le.localeCompare(y.le))[0].le, a.changements[0].avecHeure) : quandChangement(a.appliqueLe, true));
/** « Digicode du bâtiment A : TA10 → TA72, à partir du 20/11/2026 » — chaque code changé, ancien → nouveau. PUR. */
export const lignesAncienNouveau = (a: ApercuEnvoi): string[] => (a.changements ?? []).map((c) =>
  `${c.place} : ${motCode(c.ancien)} → ${motCode(c.nouveau)}, à partir du ${quandChangement(c.le, c.avecHeure)}`);

/** Le verdict du mail à la Gestion : A ; B tous prévenus ; B avec des non prévenus (leur nombre). PUR. */
export function verdictGestion(a: ApercuEnvoi, mode: ModePrevenir, decoches: ReadonlySet<number>, resultats?: ReadonlyMap<number, boolean>): { sorte: 'alerte_a' | 'information' | 'alerte_b'; nonPrevenus: number } {
  const concernes = a.logements.flatMap((l) => l.locataires.filter((x) => x.inclus));
  const non = concernes.filter((x) => !sortLocataire(x, mode, decoches, resultats).prevenu).length;
  return mode === 'gestion' ? { sorte: 'alerte_a', nonPrevenus: non } : non === 0 ? { sorte: 'information', nonPrevenus: 0 } : { sorte: 'alerte_b', nonPrevenus: non };
}

/** L'objet du mail à la Gestion : l'alerte le dit en objet. PUR. */
export function objetGestion(a: ApercuEnvoi, mode: ModePrevenir, decoches: ReadonlySet<number> = new Set(), resultats?: ReadonlyMap<number, boolean>): string {
  const v = verdictGestion(a, mode, decoches, resultats);
  if (v.sorte === 'alerte_a') return `[ALERTE] Digicode modifié sans que les locataires aient été prévenus — ${lieuDe(a)}`;
  if (v.sorte === 'alerte_b') return `[ALERTE] Digicode modifié : ${v.nonPrevenus} locataire${v.nonPrevenus > 1 ? 's' : ''} non prévenu${v.nonPrevenus > 1 ? 's' : ''} — ${lieuDe(a)}`;
  return `[Information] Digicodes mis à jour — ${lieuDe(a)} — à compter du ${premiereDate(a)}`;
}

/**
 * LE MAIL À LA GESTION (après les mails aux locataires, quand ils partent : `resultats` dit lesquels sont partis). `null` : pas d'adresse de Gestion. PUR.
 */
export function mailGestion(a: ApercuEnvoi, c: ContexteMail, o: { mode: ModePrevenir; decoches: ReadonlySet<number>; proprietaires: boolean; resultats?: ReadonlyMap<number, boolean> }): MailAvis | null {
  const dest = adressesUniques([a.adresseGestion ?? '']);
  if (dest.length === 0) return null;
  const v = verdictGestion(a, o.mode, o.decoches, o.resultats);
  const plusieurs = datesDe(a, a.logements).length > 1;
  const nomEtMail = (x: LocataireDest): string => `${prenomNom(x)}${adressesUniques(x.emails).length > 0 ? ` (${adressesUniques(x.emails).join(', ')})` : ''}`;
  const ligneLocataire = (x: LocataireDest): string => {
    if (!x.inclus) return `  – ${prenomNom(x)} — ${x.raison ?? 'parti'} : non concerné`;
    const r = sortLocataire(x, o.mode, o.decoches, o.resultats);
    return r.prevenu ? `  – ${nomEtMail(x)} — prévenu par mail` : `  – ${nomEtMail(x)} — NON PRÉVENU${r.raison === 'choix A' ? '' : ` (${r.raison})`}`;
  };
  const bloc = (l: LogementDest, filtre: (x: LocataireDest) => boolean = () => true): string => {
    const loc = l.locataires.filter(filtre).map(ligneLocataire);
    return [`· ${enteteLogement(l)}`, ...lignesCodes(a, l, plusieurs).map((x) => `  ${x}`), ...(loc.length > 0 ? loc : ['  – aucun locataire en place'])].join('\n');
  };
  const codes = lignesAncienNouveau(a);
  const paraCodes: ParagrapheMail[] = codes.length > 0 ? [`Code${codes.length > 1 ? 's' : ''} modifié${codes.length > 1 ? 's' : ''} (ancien → nouveau) :\n${codes.join('\n')}`] : [];
  const prop = o.proprietaires ? ' Les propriétaires ont aussi été prévenus.' : '';
  const lieu = lieuDe(a);
  const paras: ParagrapheMail[] = v.sorte === 'alerte_a'
    ? ['Bonjour,', { texte: 'ALERTE : digicode modifié sans que les locataires aient été prévenus.', gras: true }, { texte: lieu, gras: true }, ...paraCodes,
      `Le changement est enregistré ; AUCUN mail n’a été envoyé aux locataires : merci de les prévenir.`,
      `Logements et locataires concernés (${a.logements.length}) :\n${a.logements.map((l) => bloc(l)).join('\n')}`, 'Bien cordialement,']
    : v.sorte === 'information'
      ? ['Bonjour,', { texte: lieu, gras: true },
        `Les digicodes de ${lieu} sont mis à jour à compter du ${premiereDate(a)} ; tous les locataires concernés ont été prévenus par des mails individuels.${prop}`,
        ...paraCodes, `Locataires prévenus, logement par logement (${a.logements.length}) :\n${a.logements.map((l) => bloc(l)).join('\n')}`, 'Bien cordialement,']
      : ['Bonjour,', { texte: `ALERTE : ${v.nonPrevenus} locataire${v.nonPrevenus > 1 ? 's' : ''} concerné${v.nonPrevenus > 1 ? 's' : ''} n’${v.nonPrevenus > 1 ? 'ont' : 'a'} pas été prévenu${v.nonPrevenus > 1 ? 's' : ''} du changement de digicode.`, gras: true },
        { texte: lieu, gras: true }, ...paraCodes,
        `Le changement est enregistré, à compter du ${premiereDate(a)}. Les locataires marqués « NON PRÉVENU » sont à prévenir autrement.${prop}`,
        `Logement par logement, les locataires prévenus et non prévenus (${a.logements.length}) :\n${a.logements.map((l) => bloc(l)).join('\n')}`, 'Bien cordialement,'];
  const m = composerMailLocation(paras, c.qui, c.signature);
  return { sorte: 'digicode_gestion', de: c.expediteur, a: dest, cc: [], objet: objetGestion(a, o.mode, o.decoches, o.resultats), texte: m.texte, html: m.html };
}
