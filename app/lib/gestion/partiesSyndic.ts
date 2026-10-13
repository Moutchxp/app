import { cleEmail, cleTelephone, type CategorieImmeuble } from './syndics';
import { enPosteLe, type PeriodeEnPoste } from './reintegrationContact';

/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — QUI, PARMI LES PARTIES D'UN BIEN, EST LE SYNDIC OU UNE PERSONNE DE L'IMMEUBLE ══
 *
 * MODULE PUR : aucune base, aucun réseau, aucun React. Il est lu par le serveur (le décompte, la route des parties) ET
 * par le navigateur (les puces des lignes de mail, les suggestions des compositeurs, le cartouche EXPÉDITEUR) — et il
 * doit répondre pareil des deux côtés, d'où une seule écriture, ici.
 *
 * CONSTAT D'ARNO (12/10/2026) : le syndic du 25 rue Edith Cavell (TEST ARNAUD), ses contacts (M. Arnaud JOREL et
 * M. Augustin JOREL, Responsables de copropriété) et l'habitant de l'immeuble (M. Norbert GREG) tombaient en « Tiers
 * indépendant » dans les PARTIES du bien. C'est faux : la fiche syndic dit qui ils sont.
 *
 * 🔴 CALCULÉ À L'AFFICHAGE, JAMAIS STOCKÉ. La famille « Syndic & immeuble » se lit dans la FICHE SYNDIC de la
 * copropriété du bien (cabinet, contacts, carnet de l'immeuble), au moment où l'on affiche. Rien n'est écrit dans
 * `gestion_partie_categorie` : modifier la fiche syndic reclasse aussitôt, et rétroactivement, toutes les
 * conversations déjà rattachées — c'est la demande, et c'est la seule façon de ne jamais avoir deux vérités.
 *
 * LA RECONNAISSANCE, dans cet ordre :
 *   ① par l'E-MAIL (l'adresse de la partie), puis ② par le TÉLÉPHONE si la conversation en porte un (la signature) ;
 *   à chaque fois, une personne EN POSTE passe avant une personne partie, et la personne NOMMÉE avant l'adresse
 *   générique : un contact du syndic, puis une personne du carnet de l'immeuble, puis l'e-mail ou le standard du cabinet. Un e-mail générique de cabinet repris par un
 *   contact (cas de TEST ARNAUD : arnaud.jorel@gmail.com est les deux) désigne donc la personne.
 *
 * « NE TRAVAILLE PLUS ICI » : le contact reste reconnu pour les mails ANTÉRIEURS à son départ ; pour un mail
 * postérieur — ou pour un mail qu'on écrit aujourd'hui, dans un compositeur — il ne l'est plus, et l'adresse retombe
 * dans sa catégorie d'avant.
 */

/** Ce que la fiche syndic dit d'une personne : ses coordonnées, son rôle, et son départ éventuel. */
export interface PersonneSyndicale {
  sorte: 'cabinet' | 'contact_syndic' | 'immeuble';
  /** Le rôle affiché, déjà écrit (« Syndic — TEST ARNAUD », « Syndic — Responsable de copropriété », « Gardien »…). */
  role: string;
  /** Le nom de la personne, ou du cabinet. */
  nom: string;
  /** Les e-mails, en clé (`cleEmail`). */
  emails: readonly string[];
  /** Les téléphones, en clé (`cleTelephone`). */
  telephones: readonly string[];
  /** « Ne travaille plus ici » : la date du départ, ou `null`. */
  partiLe: string | null;
  /**
   * 🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — les périodes en poste, quand la personne est partie puis
   * revenue (« Réintégrer ») : reconnue pendant CHAQUE période, pas entre les deux. Absent : `partiLe` seul fait foi.
   */
  periodes?: PeriodeEnPoste[];
}

/** Ce que la reconnaissance rend : le rôle, la personne, et par quoi on l'a reconnue. */
export interface RoleSyndical {
  role: string;
  nom: string;
  sorte: PersonneSyndicale['sorte'];
  par: 'email' | 'telephone';
  /** Le départ de la personne reconnue (« Ne travaille plus ici »), ou `null`. */
  partiLe: string | null;
  /** Ses périodes en poste, quand elle est partie puis revenue. */
  periodes?: PeriodeEnPoste[];
}

/** Le titre de la famille, au mot près (légende, groupe du bloc PARTIES, bulles). */
export const TITRE_SYNDIC_IMMEUBLE = 'Syndic & immeuble';

/**
 * Ce que dit la bande rose quand elle est vide : la famille ne se range pas à la main, elle vient de la fiche syndic.
 * (Elle n'est donc jamais une zone de dépôt, et ne le prétend pas.)
 */
/* LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — depuis la migration 344, on y entre AUSSI en y glissant une
   personne pour ce bien seulement : la phrase le dit, sinon elle décrirait un seul des deux chemins. */
export const MOT_SYNDIC_IMMEUBLE_VIDE =
  'Personne de la fiche syndic ni du carnet de l’immeuble dans ces échanges. On y entre en ajoutant la personne à la fiche syndic, '
  + 'ou en y glissant une personne pour ce bien seulement.';

/**
 * LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — le rôle d'une personne rangée À LA MAIN en « Syndic &
 * immeuble » sur un bien (classement local, migration 344) : ni contact de la fiche syndic, ni carnet de l'immeuble.
 */
export const ROLE_SYNDIC_A_LA_MAIN = 'Syndic & immeuble — classée à la main pour ce bien';

/** « Syndic — <nom du cabinet> ». */
export function roleCabinet(nomCabinet: string): string {
  return `Syndic — ${nomCabinet.trim()}`;
}

/** « Syndic — Responsable de copropriété », ou le rôle saisi ; « Syndic — Contact » quand rien n'est saisi. */
export function roleContactSyndic(titre: string | null | undefined): string {
  const t = (titre ?? '').trim();
  return `Syndic — ${t === '' ? 'Contact' : t}`;
}

/**
 * Le rôle d'une personne du carnet de l'immeuble : « Gardien », « Conseil syndical », ou le libellé saisi
 * (« Habitant »…). Un libellé vide ou le seul mot « Contact » se dit « Contact immeuble » : hors de la fiche, « Contact »
 * ne dirait pas de quoi.
 */
export function roleImmeuble(categorie: CategorieImmeuble | string, libelle: string | null | undefined): string {
  if (categorie === 'gardien') return 'Gardien';
  if (categorie === 'conseil_syndical') return 'Conseil syndical';
  const l = (libelle ?? '').trim();
  if (l === '' || l.toLowerCase() === 'contact') return 'Contact immeuble';
  return l.charAt(0).toLocaleUpperCase('fr') + l.slice(1);
}

const ORDRE: Record<PersonneSyndicale['sorte'], number> = { contact_syndic: 0, immeuble: 1, cabinet: 2 };

/** La personne compte-t-elle encore à cette date ? `date` nulle = aujourd'hui (un mail qu'on écrit). */
function presente(p: PersonneSyndicale, date: string | null): boolean {
  if (p.periodes !== undefined && p.periodes.length > 0) return enPosteLe(p.periodes, date);
  if (p.partiLe === null) return true;
  if (date === null) return false;
  const d = Date.parse(date);
  const parti = Date.parse(p.partiLe);
  if (Number.isNaN(d) || Number.isNaN(parti)) return false;
  return d < parti;
}

/**
 * 🔴 LA RECONNAISSANCE. PURE. `date` = la date du mail (ISO), ou `null` pour « maintenant ».
 * Rend `null` quand rien dans la fiche syndic ne désigne cette adresse ni ce téléphone.
 */
export function reconnaitreSyndical(
  personnes: readonly PersonneSyndicale[],
  qui: { email?: string | null; telephone?: string | null },
  date: string | null,
): RoleSyndical | null {
  /* La personne EN POSTE passe avant celle qui est partie (une coordonnée reprise par un successeur, ou le standard
     qu'un ancien contact avait noté, désigne qui est là) ; puis le contact du syndic, l'immeuble, le cabinet. */
  const vivantes = personnes.filter((p) => presente(p, date))
    .sort((a, b) => Number(a.partiLe !== null) - Number(b.partiLe !== null) || ORDRE[a.sorte] - ORDRE[b.sorte]);
  /* (Une personne revenue a `partiLe` nul : elle est EN POSTE aujourd'hui, et compte comme telle.) */
  const e = cleEmail(qui.email ?? '');
  if (e !== '') {
    const p = vivantes.find((x) => x.emails.includes(e));
    if (p !== undefined) return { role: p.role, nom: p.nom, sorte: p.sorte, par: 'email', partiLe: p.partiLe, ...(p.periodes ? { periodes: p.periodes } : {}) };
  }
  const t = cleTelephone(qui.telephone ?? '');
  /* Un numéro trop court (un poste, une extension) ne désigne personne. */
  if (t.length >= 9) {
    const p = vivantes.find((x) => x.telephones.includes(t));
    if (p !== undefined) return { role: p.role, nom: p.nom, sorte: p.sorte, par: 'telephone', partiLe: p.partiLe, ...(p.periodes ? { periodes: p.periodes } : {}) };
  }
  return null;
}

/**
 * LA FAMILLE D'UNE ADRESSE SUR UN BIEN, RÉSOLUE AVEC LA PRIORITÉ D'ARNO. PURE.
 *
 * « Si une personne est aussi propriétaire ou locataire du bien, ce rôle-là l'emporte. “Syndic & immeuble” passe
 * avant “Tiers indépendant”. » Donc :
 *   · propriétaire, locataire, ancien locataire (fiche ou rangement)  → inchangé ;
 *   · tiers indépendant, non affecté, ou rien                          → « Syndic & immeuble » si la fiche syndic le dit.
 */
export function syndicalPrimeSur(categorie: string | null | undefined): boolean {
  return categorie !== 'proprietaire' && categorie !== 'locataire' && categorie !== 'ancien_locataire';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 À L'ÉCRAN : CE QUE LE SERVEUR A RECONNU POUR CHAQUE ADRESSE D'UN BIEN, ET COMMENT LES VUES S'EN SERVENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Ce que la route des parties rend pour une adresse reconnue sur un bien. `partiLe` n'est rempli que lorsque la
 * reconnaissance tient à un contact parti (« Ne travaille plus ici ») : à partir de cette date, l'adresse ne
 * désigne plus le syndic.
 */
export interface SyndicalDeLAdresse {
  role: string;
  nom: string;
  partiLe: string | null;
  /** 🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — partie puis revenue : ses périodes en poste. */
  periodes?: PeriodeEnPoste[];
}

/** adresse (minuscules) → ce que la fiche syndic en dit. */
export type SyndicauxDuBien = ReadonlyMap<string, SyndicalDeLAdresse>;

/** L'adresse désigne-t-elle encore le syndic à cette date ? Sans date : oui (lecture « à l'adresse »). */
export function syndicalALaDate(s: SyndicalDeLAdresse, date?: string | null): boolean {
  if (date === undefined) return true;
  if (s.periodes !== undefined && s.periodes.length > 0) return enPosteLe(s.periodes, date);
  if (s.partiLe === null) return true;
  if (date === null) return false;
  const d = Date.parse(date);
  const parti = Date.parse(s.partiLe);
  return !Number.isNaN(d) && !Number.isNaN(parti) && d < parti;
}

/**
 * 🔴 LA CATÉGORIE D'UNE ADRESSE, FAMILLE « SYNDIC & IMMEUBLE » COMPRISE. PURE.
 *
 * `categories` est la carte d'AVANT ce lot (fiche + rangements) ; `syndicaux` ce que la fiche syndic reconnaît ;
 * `date` la date du mail quand la question porte sur un mail précis (puce, liseré, capsule d'envoi), absente quand
 * elle porte sur la personne (le groupe du bloc PARTIES). Propriétaire et locataire l'emportent toujours.
 */
export function categorieAvecSyndical<C extends string>(
  adresse: string,
  categories: ReadonlyMap<string, C>,
  syndicaux: SyndicauxDuBien | undefined,
  date?: string | null,
): C | 'syndic_immeuble' | undefined {
  const cle = adresse.trim().toLowerCase();
  const c = categories.get(cle);
  const s = syndicaux?.get(cle);
  if (s !== undefined && syndicalPrimeSur(c) && syndicalALaDate(s, date)) return 'syndic_immeuble';
  return c;
}

/** La carte ENTIÈRE, famille « Syndic & immeuble » posée — pour le bloc PARTIES (lecture à l'adresse). PURE. */
export function avecSyndical<C extends string>(
  categories: ReadonlyMap<string, C>,
  syndicaux: SyndicauxDuBien | undefined,
): ReadonlyMap<string, C | 'syndic_immeuble'> {
  if (syndicaux === undefined || syndicaux.size === 0) return categories;
  const m = new Map<string, C | 'syndic_immeuble'>(categories);
  for (const a of syndicaux.keys()) {
    const c = categorieAvecSyndical(a, categories, syndicaux);
    if (c !== undefined) m.set(a, c);
  }
  return m;
}

/** Relit la liste rendue par la route (JSON) en carte. Une ligne illisible est ignorée. PURE. */
export function syndicauxDepuisJson(v: unknown): SyndicauxDuBien {
  const m = new Map<string, SyndicalDeLAdresse>();
  if (!Array.isArray(v)) return m;
  for (const x of v as Array<Record<string, unknown>>) {
    if (typeof x?.adresse !== 'string' || typeof x.role !== 'string') continue;
    const periodes = Array.isArray(x.periodes) ? (x.periodes as Array<Record<string, unknown>>)
      .map((q) => ({ du: typeof q?.du === 'string' ? q.du : null, au: typeof q?.au === 'string' ? q.au : null })) : undefined;
    m.set(x.adresse.trim().toLowerCase(), {
      role: x.role, nom: typeof x.nom === 'string' ? x.nom : '',
      partiLe: typeof x.partiLe === 'string' ? x.partiLe : null,
      ...(periodes !== undefined && periodes.length > 0 ? { periodes } : {}),
    });
  }
  return m;
}

/**
 * LE CALCUL SERVEUR, PUR : pour chaque adresse d'un bien (son premier mail sur ce bien, et le téléphone de sa
 * signature quand on en a un), ce que la fiche syndic en dit. La personne est lue À LA DATE DE SON PREMIER MAIL :
 * un contact parti depuis reste le syndic de ce qu'il a écrit avant, et sa date de départ voyage avec lui.
 */
export function syndicauxDesAdresses(
  personnes: readonly PersonneSyndicale[],
  adresses: readonly { adresse: string; premierMail: string | null; telephone?: string | null }[],
): Array<{ adresse: string } & SyndicalDeLAdresse> {
  const out: Array<{ adresse: string } & SyndicalDeLAdresse> = [];
  if (personnes.length === 0) return out;
  for (const a of adresses) {
    const r = reconnaitreSyndical(personnes, { email: a.adresse, telephone: a.telephone ?? null }, a.premierMail);
    if (r === null) continue;
    out.push({ adresse: a.adresse.trim().toLowerCase(), role: r.role, nom: r.nom, partiLe: r.partiLe,
      ...(r.periodes ? { periodes: r.periodes } : {}) });
  }
  return out;
}
