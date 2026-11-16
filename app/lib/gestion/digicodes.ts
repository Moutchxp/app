import { cleBatiment, libelleBatiment, libelleValeur, MAX_CODE_DIGICODE, type ValeurDigicode } from '../location/digicodeImmeuble';

/**
 * ══ 🔴🔴 LES DIGICODES UNIFIÉS (Arno, 16/11/2026, chantier « Digicodes unifiés », migration 478). MODULE PUR. ═══════════════════════════════
 *
 * UNE SEULE BASE, rattachée à la copropriété : un code par ADRESSE de la copropriété (`adresseCle` = `cleImmeuble`, la clé de la fiche
 * Copropriété et des biens) et par BÂTIMENT ('' = le code COMMUN de l'adresse ; une cage d'escalier est un bâtiment). Chaque code a sa DATE ET
 * HEURE D'APPLICATION : le code EN VIGUEUR à un instant T est la dernière ligne non annulée dont l'application est passée (à égalité de date,
 * la plus récente : une correction l'emporte sur la ligne qu'elle corrige). Les lignes à venir sont les CHANGEMENTS PRÉVUS ; les passées,
 * l'HISTORIQUE. Rien ne s'efface.
 *
 * LES VALEURS D'AVANT (396 : code par adresse postale, 399 : par bâtiment, colonnes du bien) restent LISIBLES telles quelles, en repli, tant
 * qu'aucun code unifié n'est en vigueur pour la même adresse et le même bâtiment. Plusieurs valeurs d'avant DIFFÉRENTES pour une même place :
 * « À ARBITRER » — rien n'est choisi tout seul, rien n'est écrasé.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export type NatureDigicode = 'saisie' | 'correction' | 'changement' | 'reprise' | 'arbitrage';
export type OrigineDigicode = 'fiche_copropriete' | 'fiche_bien' | 'nouveau_bien' | 'reprise';

export interface LigneDigicode {
  id: number; adresseCle: string; adresseLibelle: string; batimentCle: string; batimentLibelle: string | null;
  digicode: boolean; code: string | null; appliqueLe: string; nature: NatureDigicode; origine: OrigineDigicode;
  lotId: number | null; corrigeId: number | null; annuleLe: string | null; creeLe: string; creeParLibelle: string;
}

/** Une valeur d'avant (396 / 399 / colonnes du bien), d'où elle vient, et les biens qui la portent. */
export interface CandidatAncien { valeur: ValeurDigicode; origines: string[]; lots: number[]; depuis: string | null }

/** Le code lu à une place (adresse, bâtiment) et à un instant. */
export interface CodeEnVigueur {
  valeur: ValeurDigicode;
  /** `unifie` : la base unique (478) ; `ancien` : une valeur d'avant, lue en repli */
  source: 'unifie' | 'ancien';
  ligne: LigneDigicode | null;
  /** date d'application (unifié) ou de dernière saisie (ancien) */
  depuis: string | null;
  /** plusieurs valeurs d'avant différentes, aucune choisie : la place est « à arbitrer » (la valeur lue est celle préférée, ou rien) */
  aArbitrer: CandidatAncien[];
  /** d'où vient une valeur d'avant (« adresse … », « bien … ») ; vide pour un code unifié */
  origines: string[];
}

const t = (iso: string): number => new Date(iso).getTime();
const triChrono = (a: LigneDigicode, b: LigneDigicode): number => t(a.appliqueLe) - t(b.appliqueLe) || a.id - b.id;

/** Les lignes (non annulées) d'une place, dans l'ordre d'application. PUR. */
export function lignesDeLaPlace(lignes: readonly LigneDigicode[], adresseCle: string, batimentCle: string): LigneDigicode[] {
  return lignes.filter((l) => l.adresseCle === adresseCle && l.batimentCle === batimentCle && l.annuleLe === null).sort(triChrono);
}

/** La ligne en vigueur à `instant` : la dernière dont l'application est passée. PUR. */
export function ligneEnVigueur(lignes: readonly LigneDigicode[], adresseCle: string, batimentCle: string, instant: Date): LigneDigicode | null {
  const passees = lignesDeLaPlace(lignes, adresseCle, batimentCle).filter((l) => t(l.appliqueLe) <= instant.getTime());
  return passees.at(-1) ?? null;
}

/** Les changements PRÉVUS après `instant` (dans l'ordre). PUR. */
export function changementsAVenir(lignes: readonly LigneDigicode[], adresseCle: string, batimentCle: string, instant: Date): LigneDigicode[] {
  return lignesDeLaPlace(lignes, adresseCle, batimentCle).filter((l) => t(l.appliqueLe) > instant.getTime());
}

/** Deux valeurs sont la même : oui / non, et le code sans tenir compte des blancs ni de la casse. PUR. */
export function memeCode(a: ValeurDigicode, b: ValeurDigicode): boolean {
  const c = (v: ValeurDigicode): string => (v.code ?? '').replace(/\s+/g, '').toUpperCase();
  return a.digicode === b.digicode && c(a) === c(b);
}

const connue = (v: ValeurDigicode): boolean => v.digicode !== null || (v.code ?? '').trim() !== '';

// ── LES VALEURS D'AVANT, RANGÉES PAR PLACE ──────────────────────────────────────────────────────────────────────────────────────────────

/** Ce que les anciennes tables savent, déjà rangé par l'appelant (dépôt) : rien n'est lu ici. */
export interface DonneesAnciennes {
  /** 396 / 399 : un immeuble par adresse POSTALE normalisée (`cleLegacy`), son code général et ceux de ses bâtiments */
  immeubles: { cleLegacy: string; voie: string; valeur: ValeurDigicode; depuis: string | null; batiments: { cle: string; libelle: string; valeur: ValeurDigicode; depuis: string | null }[] }[];
  /** les biens actifs : leur place dans la copropriété (`adresseCle`), leur adresse postale (`cleLegacy`), leur bâtiment, leurs anciennes colonnes */
  lots: { id: number; numero: string | null; adresseCle: string; cleLegacy: string | null; batimentCle: string; valeur: ValeurDigicode }[];
  /** chaque adresse de copropriété : sa place, et la clé postale sous laquelle la fiche Copropriété écrivait jusqu'ici (son libellé) */
  adresses: { adresseCle: string; libelle: string; cleLegacy: string | null }[];
}

/** Les valeurs d'avant d'une place, regroupées quand elles sont identiques. PUR. */
export function candidatsAnciens(d: DonneesAnciennes, adresseCle: string, batimentCle: string): CandidatAncien[] {
  const lotsIci = d.lots.filter((l) => l.adresseCle === adresseCle);
  const cles = new Set<string>([...d.adresses.filter((a) => a.adresseCle === adresseCle).map((a) => a.cleLegacy), ...lotsIci.map((l) => l.cleLegacy)]
    .filter((x): x is string => x !== null));
  const bruts: { valeur: ValeurDigicode; origine: string; lots: number[]; depuis: string | null }[] = [];
  for (const im of d.immeubles.filter((x) => cles.has(x.cleLegacy))) {
    const biensIm = lotsIci.filter((l) => l.cleLegacy === im.cleLegacy);
    if (batimentCle === '') {
      if (connue(im.valeur)) bruts.push({ valeur: im.valeur, origine: `adresse ${im.voie}`, lots: biensIm.filter((l) => l.batimentCle === '').map((l) => l.id), depuis: im.depuis });
    } else {
      for (const b of im.batiments.filter((x) => x.cle === batimentCle && connue(x.valeur))) {
        bruts.push({ valeur: b.valeur, origine: `bâtiment ${b.libelle}, adresse ${im.voie}`, lots: biensIm.filter((l) => l.batimentCle === batimentCle).map((l) => l.id), depuis: b.depuis });
      }
    }
  }
  // les anciennes colonnes d'un bien : lues seulement quand l'immeuble de SON adresse n'a rien (la règle d'avant) ; elles valent pour le code commun
  if (batimentCle === '') {
    for (const l of lotsIci) {
      if (!connue(l.valeur)) continue;
      const im = d.immeubles.find((x) => x.cleLegacy === l.cleLegacy);
      if (im !== undefined && connue(im.valeur)) continue;
      bruts.push({ valeur: l.valeur, origine: `bien ${l.numero ?? l.id}`, lots: [l.id], depuis: null });
    }
  }
  const out: CandidatAncien[] = [];
  for (const b of bruts) {
    const x = out.find((c) => memeCode(c.valeur, b.valeur));
    if (x === undefined) out.push({ valeur: b.valeur, origines: [b.origine], lots: [...b.lots], depuis: b.depuis });
    else { x.origines.push(b.origine); for (const id of b.lots) if (!x.lots.includes(id)) x.lots.push(id); if (x.depuis === null || (b.depuis !== null && b.depuis > x.depuis)) x.depuis = b.depuis ?? x.depuis; }
  }
  return out;
}

/**
 * LE CODE EN VIGUEUR d'une place à un instant : la base unique d'abord ; sinon la valeur d'avant (une seule : lue ; plusieurs différentes :
 * « à arbitrer », et l'on lit celle que préfère l'appelant — la valeur de l'adresse du bien, comme avant — ou rien). `null` : rien de connu. PUR.
 */
export function codeEnVigueur(lignes: readonly LigneDigicode[], anciens: readonly CandidatAncien[], adresseCle: string, batimentCle: string, instant: Date,
  prefere: (c: CandidatAncien) => boolean = () => false): CodeEnVigueur | null {
  const l = ligneEnVigueur(lignes, adresseCle, batimentCle, instant);
  if (l !== null) return { valeur: { digicode: l.digicode, code: l.code }, source: 'unifie', ligne: l, depuis: l.appliqueLe, aArbitrer: [], origines: [] };
  if (anciens.length === 0) return null;
  if (anciens.length === 1) return { valeur: anciens[0].valeur, source: 'ancien', ligne: null, depuis: anciens[0].depuis, aArbitrer: [], origines: anciens[0].origines };
  const p = anciens.find(prefere);
  return { valeur: p?.valeur ?? { digicode: null, code: null }, source: 'ancien', ligne: null, depuis: p?.depuis ?? null, aArbitrer: [...anciens], origines: p?.origines ?? [] };
}

/** La date et l'heure lisibles (heure de Paris) : « 20/11/2026 à 09:00 ». PUR. */
export const dateHeure = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');

/** Un changement à venir, en une ligne : « nouveau code 57B83 à partir du 20/11/2026 à 09:00 » / « plus de digicode à partir du … ». PUR. */
export function motChangementAVenir(c: { valeur: ValeurDigicode; appliqueLe: string; batiment?: string | null }): string {
  const ou = c.batiment ? ` (bâtiment ${c.batiment})` : '';
  const quoi = c.valeur.digicode === false ? 'plus de digicode' : `nouveau code ${c.valeur.code ?? ''}`.trim();
  return `${quoi}${ou} à partir du ${dateHeure(c.appliqueLe)}`;
}

/** La mention d'une place « à arbitrer ». */
export const MENTION_A_ARBITRER = 'plusieurs codes différents sont connus — à arbitrer dans la fiche Copropriété';

// ── LES RÈGLES D'ÉCRITURE (le dépôt les applique dans la transaction) ───────────────────────────────────────────────────────────────────

export const MOTIF_DEJA_CONNU = (v: ValeurDigicode): string =>
  `Ce digicode est déjà connu (${libelleValeur(v)}) : pour le changer, utilisez « Corriger une erreur » (faute de frappe) ou « Modifier » (le syndic change le code, à une date). Rien n’est enregistré.`;
export const MOTIF_RIEN_A_CORRIGER = 'Aucun digicode en vigueur à corriger ici : saisissez-le directement. Rien n’est enregistré.';
export const MOTIF_A_ARBITRER = 'Plusieurs valeurs différentes sont connues pour ce digicode : choisissez d’abord la bonne dans « À arbitrer ». Rien n’est enregistré.';
export const MOTIF_DATE_PASSEE = 'La date et l’heure d’application doivent être à venir. Rien n’est enregistré.';
export const MOTIF_CHANGEMENT_PREVU = (le: string): string => `Un changement est déjà prévu pour ce digicode (${le}) : annulez-le d’abord. Rien n’est enregistré.`;
export const MOTIF_ARBITRAGE_HORS_LISTE = 'Cette valeur ne fait pas partie des valeurs à arbitrer : rechargez la fiche. Rien n’est enregistré.';
export const MOTIF_PAS_A_ARBITRER = 'Ce digicode n’est pas (ou plus) à arbitrer : rechargez la fiche. Rien n’est enregistré.';

/** La saisie d'une valeur : oui / non, code de 8 caractères au plus et seulement avec oui ; `null` (rien) refusé — un code ne se « vide » pas. PUR. */
export function valeurSaisie(brut: { digicode?: unknown; code?: unknown }): { ok: true; valeur: { digicode: boolean; code: string | null } } | { ok: false; motif: string } {
  const digicode = brut.digicode === true || brut.digicode === 'oui' ? true : brut.digicode === false || brut.digicode === 'non' ? false : null;
  if (digicode === null) return { ok: false, motif: 'Indiquez le code, ou « pas de digicode ».' };
  const code = digicode && typeof brut.code === 'string' && brut.code.trim() !== '' ? brut.code.trim() : null;
  if (code !== null && code.length > MAX_CODE_DIGICODE) return { ok: false, motif: 'Le code du digicode fait 8 caractères au plus.' };
  if (digicode && code === null) return { ok: false, motif: 'Indiquez le code du digicode (ou « pas de digicode »).' };
  return { ok: true, valeur: { digicode, code } };
}

/** La place d'un bâtiment : clé et libellé affiché (« Bât. B » → « b » / « B ») ; vide = le code commun. PUR. */
export function placeBatiment(brut: string | null | undefined): { cle: string; libelle: string | null } {
  const cle = cleBatiment(brut);
  return cle === '' ? { cle: '', libelle: null } : { cle, libelle: libelleBatiment(brut) };
}

// ── LA REPRISE (à blanc par défaut) ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PlaceAReprendre { adresseCle: string; adresse: string; batimentCle: string; batiment: string | null; valeur: ValeurDigicode; depuis: string | null; origines: string[]; lots: number[] }
export interface PlaceAArbitrer { adresseCle: string; adresse: string; batimentCle: string; batiment: string | null; candidats: CandidatAncien[] }
export interface PlanRepriseUnifiee { aReprendre: PlaceAReprendre[]; aArbitrer: PlaceAArbitrer[]; dejaUnifiees: number; places: number }

/**
 * LE PLAN DE REPRISE : chaque place (adresse de copropriété × bâtiment) qui porte une valeur d'avant et AUCUN code unifié : une seule valeur
 * → à reprendre (telle quelle, avec sa date) ; plusieurs différentes → À ARBITRER (rien n'est choisi). PUR.
 */
export function planRepriseUnifiee(d: DonneesAnciennes, lignes: readonly LigneDigicode[], libelleAdresse: (adresseCle: string) => string,
  libelleBat: (adresseCle: string, batimentCle: string) => string | null): PlanRepriseUnifiee {
  const places = new Map<string, { adresseCle: string; batimentCle: string }>();
  const ajoute = (adresseCle: string, batimentCle: string): void => { places.set(`${adresseCle}#${batimentCle}`, { adresseCle, batimentCle }); };
  for (const a of d.adresses) {
    ajoute(a.adresseCle, '');
    for (const im of d.immeubles.filter((x) => x.cleLegacy === a.cleLegacy)) for (const b of im.batiments) ajoute(a.adresseCle, b.cle);
  }
  for (const l of d.lots) {
    ajoute(l.adresseCle, '');
    if (l.batimentCle !== '') ajoute(l.adresseCle, l.batimentCle);
    for (const im of d.immeubles.filter((x) => x.cleLegacy === l.cleLegacy)) for (const b of im.batiments) ajoute(l.adresseCle, b.cle);
  }
  const plan: PlanRepriseUnifiee = { aReprendre: [], aArbitrer: [], dejaUnifiees: 0, places: 0 };
  for (const { adresseCle, batimentCle } of [...places.values()].sort((a, b) => `${a.adresseCle}#${a.batimentCle}`.localeCompare(`${b.adresseCle}#${b.batimentCle}`, 'fr'))) {
    const c = candidatsAnciens(d, adresseCle, batimentCle);
    if (c.length === 0) continue;
    plan.places += 1;
    if (lignesDeLaPlace(lignes, adresseCle, batimentCle).length > 0) { plan.dejaUnifiees += 1; continue; }
    const base = { adresseCle, adresse: libelleAdresse(adresseCle), batimentCle, batiment: batimentCle === '' ? null : libelleBat(adresseCle, batimentCle) };
    if (c.length === 1) plan.aReprendre.push({ ...base, valeur: c[0].valeur, depuis: c[0].depuis, origines: c[0].origines, lots: c[0].lots });
    else plan.aArbitrer.push({ ...base, candidats: c });
  }
  return plan;
}

/** Le rapport de reprise, en texte (fichier et console). 🔒 Les CODES n'y figurent pas en clair (seulement « oui · code ••12 » / « non »). PUR. */
export function texteRapportRepriseUnifiee(p: PlanRepriseUnifiee, o: { reel: boolean; ecrites: number; date: string }): string {
  const masque = (v: ValeurDigicode): string => (v.digicode === null ? 'non renseigné' : v.digicode ? (v.code ? `oui · code ${'•'.repeat(Math.max(0, v.code.length - 2))}${v.code.slice(-2)}` : 'oui (code inconnu)') : 'non (pas de digicode)');
  const place = (x: { adresse: string; batiment: string | null }): string => `${x.adresse}${x.batiment === null ? ' — code commun' : ` — bâtiment ${x.batiment}`}`;
  return [
    `REPRISE DES DIGICODES DANS LA BASE UNIQUE (478) — ${o.reel ? 'RÉELLE (écrite)' : 'À BLANC (rien n’est écrit)'} — ${o.date}`,
    `Places (adresse de copropriété × bâtiment) portant une valeur d’avant : ${p.places}`,
    `${o.reel ? 'Reprises' : 'À reprendre'} : ${p.aReprendre.length}${o.reel ? ` (lignes écrites : ${o.ecrites})` : ''} · déjà dans la base unique : ${p.dejaUnifiees} · À ARBITRER : ${p.aArbitrer.length}`,
    'Les anciennes tables (396, 399, colonnes du bien) ne sont NI vidées NI modifiées ; rien n’est choisi pour une place à arbitrer.',
    '', '━━ À ARBITRER (valeurs différentes ; rien n’est choisi) ━━',
    ...(p.aArbitrer.length === 0 ? ['(aucune)'] : p.aArbitrer.flatMap((a) => [`· ${place(a)}`, ...a.candidats.map((c) => `    ${masque(c.valeur)} — ${c.origines.join(' ; ')}${c.lots.length > 0 ? ` (biens ${c.lots.join(', ')})` : ''}`)])),
    '', `━━ ${o.reel ? 'REPRISES' : 'À REPRENDRE'} ━━`,
    ...(p.aReprendre.length === 0 ? ['(aucune)'] : p.aReprendre.map((r) => `· ${place(r)} : ${masque(r.valeur)} — ${r.origines.join(' ; ')}${r.lots.length > 0 ? ` (biens ${r.lots.join(', ')})` : ''}`)),
  ].join('\n');
}
