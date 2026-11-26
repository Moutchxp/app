import { query, withTransaction, type RequeteTx } from '../db/client';
import { registreParAdresse, reprendreSiRetire } from './batimentRetraitRepo';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { cleBatiment, cleImmeubleAdresse, libelleValeur, majusculesBatimentOuNul, type ValeurDigicode } from '../location/digicodeImmeuble';
import { batimentDe } from './batimentsCopropriete';
import { immeubleDuBien, type MailGestionHisto } from './copropriete';
import { cleImmeuble } from './syndics';
import {
  candidatsAnciens, changementsAVenir, codeEnVigueur, dateHeure, lignesDeLaPlace, memeCode, MOTIF_A_ARBITRER, MOTIF_ARBITRAGE_HORS_LISTE, MOTIF_CHANGEMENT_PREVU,
  MOTIF_DATE_PASSEE, MOTIF_DEJA_CONNU, MOTIF_PAS_A_ARBITRER, MOTIF_RIEN_A_CORRIGER, placeBatiment, planRepriseUnifiee, valeurSaisie,
  type CodeEnVigueur, type DonneesAnciennes, type LigneDigicode, type OrigineDigicode, type PlanRepriseUnifiee, MAX_CODE_DIGICODE_UNIFIE } from './digicodes';

/**
 * ══ 🔴🔴 LES DIGICODES UNIFIÉS — LE CHEMIN SERVEUR UNIQUE (Arno, 16/11/2026, migration 478). IMPUR (base). ═══════════════════════════════════
 *
 * TOUTE écriture d'un digicode passe par `ecrireDigicode` (fiche Copropriété ET fiche du bien en Location, création comprise) ; toute lecture par
 * `digicodesDuBien` / `lignesDigicodes` + les règles pures de `digicodes.ts`. Les anciennes tables (396, 399, colonnes du bien) ne sont plus
 * jamais écrites d'ici : elles sont LUES, en repli et pour la rubrique « À arbitrer ».
 * SANS LA 478 : `digicodesUnifiesDisponibles()` est faux ; les appelants gardent leur chemin d'avant (rien ne change).
 */

export function digicodesUnifiesDisponibles(): Promise<boolean> {
  return colonneExisteMemo('gestion_digicode', 'applique_le');
}

const COLONNES = `id::text, adresse_cle, adresse_libelle, batiment_cle, batiment_libelle, digicode, code, to_json(applique_le)#>>'{}' AS applique_le, nature, origine,
  lot_id::text, corrige_id::text, to_json(annule_le)#>>'{}' AS annule_le, to_json(cree_le)#>>'{}' AS cree_le, cree_par_libelle,
  (SELECT u.prenom FROM admin_utilisateur u WHERE u.id = gestion_digicode.cree_par) AS par_prenom, (SELECT u.nom FROM admin_utilisateur u WHERE u.id = gestion_digicode.cree_par) AS par_nom`;
interface LigneSql { id: string; adresse_cle: string; adresse_libelle: string; batiment_cle: string; batiment_libelle: string | null; digicode: boolean; code: string | null;
  applique_le: string; nature: LigneDigicode['nature']; origine: OrigineDigicode; lot_id: string | null; corrige_id: string | null; annule_le: string | null; cree_le: string; cree_par_libelle: string;
  par_prenom?: string | null; par_nom?: string | null }
/** « Prénom NOM » d'un compte (le nom en capitales) ; `null` : aucun des deux. PUR. */
const prenomNomCompte = (prenom: string | null | undefined, nom: string | null | undefined): string | null =>
  [(prenom ?? '').replace(/\s+/g, ' ').trim(), (nom ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr-FR')].filter((x) => x !== '').join(' ') || null;
const versLigne = (r: LigneSql): LigneDigicode => ({ id: Number(r.id), adresseCle: r.adresse_cle, adresseLibelle: r.adresse_libelle, batimentCle: r.batiment_cle,
  // 🔴 (26/11/2026) l'intitulé existant se lit en MAJUSCULES
  batimentLibelle: majusculesBatimentOuNul(r.batiment_libelle), digicode: r.digicode, code: r.code, appliqueLe: r.applique_le, nature: r.nature, origine: r.origine, lotId: r.lot_id === null ? null : Number(r.lot_id),
  corrigeId: r.corrige_id === null ? null : Number(r.corrige_id), annuleLe: r.annule_le, creeLe: r.cree_le, creeParLibelle: r.cree_par_libelle,
  creeParNom: prenomNomCompte(r.par_prenom, r.par_nom) });

/** Toutes les lignes (annulées comprises : l'historique les montre) des adresses données. `[]` sans la 478. LECTURE SEULE. */
export async function lignesDigicodes(adresseCles: readonly string[], q: RequeteTx = query): Promise<LigneDigicode[]> {
  if (adresseCles.length === 0 || !(await digicodesUnifiesDisponibles())) return [];
  const { rows } = await q<LigneSql>(`SELECT ${COLONNES} FROM gestion_digicode WHERE adresse_cle = ANY($1::text[]) ORDER BY applique_le, id`, [[...new Set(adresseCles)]]);
  return rows.map(versLigne);
}

// ── CE QUE SAVENT LES ANCIENNES TABLES (lu, jamais écrit) ───────────────────────────────────────────────────────────────────────────────

/** Les biens actifs, rangés à leur place (adresse de copropriété), avec le bâtiment lié (478) ou, à défaut, le texte « Bâtiment ». */
async function lotsActifs(q: RequeteTx): Promise<{ id: number; numero: string | null; immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null;
  batiment: string | null; batimentLieCle: string | null; escalier: string | null; digicode: boolean | null; code: string | null }[]> {
  const bat = (await colonneExisteMemo('gestion_annuaire_lot', 'batiment')) ? 'l.batiment, l.escalier' : 'NULL::text AS batiment, NULL::text AS escalier';
  const lie = (await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id')) ? 'cb.batiment_cle' : 'NULL::text';
  const jointure = lie === 'NULL::text' ? '' : 'LEFT JOIN gestion_copropriete_batiment cb ON cb.id = l.copropriete_batiment_id';
  const { rows } = await q<{ id: string; numero: string | null; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null; batiment: string | null;
    escalier: string | null; lie: string | null; digicode: boolean | null; code: string | null }>(
    `SELECT l.id::text, l.wippimmo_id AS numero, l.immeuble, l.adresse, l.code_postal, l.commune, ${bat}, ${lie} AS lie, l.digicode, l.digicode_code AS code
       FROM gestion_annuaire_lot l ${jointure} WHERE l.absent_le IS NULL ORDER BY l.id`);
  return rows.map((r) => ({ id: Number(r.id), numero: r.numero, immeuble: r.immeuble, adresse: r.adresse, codePostal: r.code_postal, commune: r.commune, batiment: r.batiment,
    batimentLieCle: r.lie, escalier: r.escalier, digicode: r.digicode, code: r.code }));
}

/** La place d'un bien dans sa copropriété : la clé de son immeuble (« Immeuble », sinon l'adresse — la règle de la fiche Copropriété). PUR. */
export const adresseCleDuBien = (l: { immeuble: string | null; adresse: string | null }): string => cleImmeuble(immeubleDuBien(l));
/** Le bâtiment d'un bien : le lien sûr (478), sinon son texte « Bâtiment ». PUR. */
export const batimentCleDuBien = (l: { batimentLieCle: string | null; batiment: string | null }): string => l.batimentLieCle ?? cleBatiment(l.batiment);

/** Tout ce que savent les anciennes tables, rangé par place (adresse de copropriété), pour la lecture de repli, l'arbitrage et la reprise. */
export async function chargerAnciens(q: RequeteTx = query): Promise<DonneesAnciennes & { lotsBruts: Awaited<ReturnType<typeof lotsActifs>> }> {
  const lots = await lotsActifs(q);
  const immeubles: DonneesAnciennes['immeubles'] = [];
  // (sondes directes : ce module ne dépend pas du dépôt d'avant, qui le lit)
  if (await colonneExisteMemo('gestion_immeuble_digicode_journal', 'immeuble_id')) {
    const { rows: im } = await q<{ id: string; cle: string; voie: string; digicode: boolean | null; code: string | null; depuis: string | null }>(
      `SELECT id::text, cle_adresse AS cle, voie, digicode, digicode_code AS code, to_json(coalesce(modifie_le, cree_le))#>>'{}' AS depuis FROM gestion_immeuble ORDER BY id`);
    const bats = (await colonneExisteMemo('gestion_immeuble_digicode_journal', 'batiment_cle'))
      ? (await q<{ immeuble: string; cle: string; libelle: string; digicode: boolean | null; code: string | null; depuis: string | null }>(
        `SELECT immeuble_id::text AS immeuble, batiment_cle AS cle, batiment_libelle AS libelle, digicode, digicode_code AS code, to_json(coalesce(modifie_le, cree_le))#>>'{}' AS depuis
           FROM gestion_immeuble_batiment ORDER BY id`)).rows : [];
    for (const i of im) {
      immeubles.push({ cleLegacy: i.cle, voie: i.voie, valeur: { digicode: i.digicode, code: i.code }, depuis: i.depuis,
        batiments: bats.filter((b) => b.immeuble === i.id).map((b) => ({ cle: b.cle, libelle: b.libelle, valeur: { digicode: b.digicode, code: b.code }, depuis: b.depuis })) });
    }
  }
  // les adresses de copropriété, avec la clé POSTALE sous laquelle la fiche Copropriété écrivait jusqu'ici (son libellé, le code postal de la fiche
  // ou de ses biens) ; une copropriété connue par ses seuls biens : le libellé de son premier bien
  const adresses: DonneesAnciennes['adresses'] = [];
  const vues = new Set<string>();
  if (await colonneExisteMemo('gestion_copropriete', 'cle_immeuble')) {
    const { rows: c } = await q<{ id: string; cle: string; libelle: string; cp: string | null; commune: string | null }>(
      'SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete ORDER BY id');
    const { rows: s } = await q<{ copro: string; cle: string; libelle: string; cp: string | null; commune: string | null }>(
      'SELECT copropriete_id::text AS copro, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id');
    for (const x of c) {
      const siens = lots.filter((l) => adresseCleDuBien(l) === x.cle);
      const cp = x.cp ?? siens.find((l) => (l.codePostal ?? '').trim() !== '')?.codePostal ?? null;
      const commune = x.commune ?? siens.find((l) => (l.commune ?? '').trim() !== '')?.commune ?? null;
      adresses.push({ adresseCle: x.cle, libelle: x.libelle, cleLegacy: cleImmeubleAdresse({ voie: x.libelle, codePostal: cp, commune }) }); vues.add(x.cle);
    }
    for (const a of s) { adresses.push({ adresseCle: a.cle, libelle: a.libelle, cleLegacy: cleImmeubleAdresse({ voie: a.libelle, codePostal: a.cp, commune: a.commune }) }); vues.add(a.cle); }
  }
  for (const l of lots) {
    const k = adresseCleDuBien(l);
    if (k === '' || vues.has(k)) continue;
    vues.add(k);
    const libelle = immeubleDuBien(l);
    const siens = lots.filter((x) => adresseCleDuBien(x) === k);
    adresses.push({ adresseCle: k, libelle, cleLegacy: cleImmeubleAdresse({ voie: libelle, codePostal: siens.find((x) => (x.codePostal ?? '').trim() !== '')?.codePostal ?? null,
      commune: siens.find((x) => (x.commune ?? '').trim() !== '')?.commune ?? null }) });
  }
  return {
    immeubles, adresses, lotsBruts: lots,
    lots: lots.map((l) => ({ id: l.id, numero: l.numero, adresseCle: adresseCleDuBien(l), cleLegacy: cleImmeubleAdresse({ voie: l.adresse, codePostal: l.codePostal, commune: l.commune }),
      batimentCle: batimentCleDuBien(l), valeur: { digicode: l.digicode, code: l.code } })).filter((l) => l.adresseCle !== ''),
  };
}

// ── LA LECTURE POUR UN BIEN ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ChangementAVenir { batiment: string | null; valeur: ValeurDigicode; appliqueLe: string }
export interface DigicodesDuBien {
  adresseCle: string;
  adresse: string;
  /** le bâtiment du bien (lien sûr, sinon son texte) ; `null` : aucun */
  batiment: { cle: string; libelle: string; lie: boolean } | null;
  /** le code commun de l'adresse et celui du bâtiment, EN VIGUEUR à l'instant demandé (`null` : rien de connu) */
  commun: CodeEnVigueur | null;
  codeBatiment: CodeEnVigueur | null;
  /** les changements prévus après l'instant demandé (commun et bâtiment du bien) */
  aVenir: ChangementAVenir[];
  /** le nombre de biens qui lisent le code commun de l'adresse, et ceux du bâtiment (pour la mention « commun aux N biens ») */
  nbBiensAdresse: number;
  nbBiensBatiment: number;
}

/** La lecture d'une place (adresse de copropriété, bâtiment) à un instant, depuis ce qui est déjà chargé. */
function lirePlaceDepuis(anciens: Awaited<ReturnType<typeof chargerAnciens>>, lignes: readonly LigneDigicode[], adresseCle: string, bCle: string, libBatBrut: string | null,
  instant: Date, prefere: (c: { lots: number[] }) => boolean): Omit<DigicodesDuBien, 'adresse' | 'batiment'> & { libBat: string | null } {
  const libBat = bCle === '' ? null : (lignes.find((x) => x.batimentCle === bCle)?.batimentLibelle ?? batimentDe(libBatBrut)?.libelle ?? bCle.toUpperCase());
  const commun = codeEnVigueur(lignes, candidatsAnciens(anciens, adresseCle, ''), adresseCle, '', instant, prefere);
  const codeBatiment = bCle === '' ? null : codeEnVigueur(lignes, candidatsAnciens(anciens, adresseCle, bCle), adresseCle, bCle, instant, prefere);
  const aVenir = [...changementsAVenir(lignes, adresseCle, '', instant), ...(bCle === '' ? [] : changementsAVenir(lignes, adresseCle, bCle, instant))]
    .sort((a, b) => new Date(a.appliqueLe).getTime() - new Date(b.appliqueLe).getTime())
    .map((x) => ({ batiment: x.batimentLibelle, valeur: { digicode: x.digicode, code: x.code }, appliqueLe: x.appliqueLe }));
  const ici = anciens.lots.filter((x) => x.adresseCle === adresseCle);
  return { adresseCle, commun, codeBatiment, aVenir, libBat, nbBiensAdresse: ici.length, nbBiensBatiment: bCle === '' ? 0 : ici.filter((x) => x.batimentCle === bCle).length };
}

/**
 * 🔴 (Arno, 20/11/2026, « Adresse officielle BAN », lot 5) LA CLÉ DE RÉFÉRENCE DES DIGICODES D'UNE ADRESSE : une ÉCRITURE d'origine (adresse de sorte
 * « écriture », 505) n'a plus son propre bloc — ses digicodes se lisent et s'écrivent à l'adresse officielle qu'elle écrit autrement : l'adresse principale
 * de sa copropriété si c'est la même adresse officielle, sinon la première adresse (sorte « adresse ») de cette adresse officielle. Une adresse qui n'est
 * pas une écriture (ou une base sans la 505) garde sa clé. LECTURE SEULE.
 */
export async function cleDeReferenceDigicode(adresseCle: string, q: RequeteTx = query): Promise<string> {
  if (adresseCle === '' || !(await colonneExisteMemo('gestion_copropriete_adresse', 'sorte'))) return adresseCle;
  const { rows: [e] } = await q<{ copro: string; ban: string | null; cle_copro: string; ban_copro: string | null }>(
    `SELECT a.copropriete_id::text AS copro, a.ban_id AS ban, c.cle_immeuble AS cle_copro, c.ban_id AS ban_copro
       FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id
      WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL AND a.sorte = 'ecriture' ORDER BY a.id LIMIT 1`, [adresseCle]);
  if (e === undefined || e.ban === null) return adresseCle;
  if (e.ban_copro === e.ban) return e.cle_copro;
  const { rows: [r] } = await q<{ cle: string }>(
    `SELECT cle_immeuble AS cle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND ban_id = $2 AND sorte = 'adresse' AND retire_le IS NULL ORDER BY id LIMIT 1`, [e.copro, e.ban]);
  return r?.cle ?? adresseCle;
}

/** Les digicodes d'un BIEN à un instant (par défaut : maintenant). `null` : bien inconnu, ou sans adresse. LECTURE SEULE. */
export async function digicodesDuBien(lotId: number, instant: Date = new Date(), q: RequeteTx = query): Promise<DigicodesDuBien | null> {
  const anciens = await chargerAnciens(q);
  const l = anciens.lotsBruts.find((x) => x.id === lotId);
  if (l === undefined) return null;
  // 🔴 (lot 5) un bien rangé sous une écriture d'origine lit les digicodes de son adresse officielle
  const adresseCle = await cleDeReferenceDigicode(adresseCleDuBien(l), q);
  if (adresseCle === '') return null;
  const lignes = await lignesDigicodes([adresseCle], q);
  const bCle = batimentCleDuBien(l);
  // à valeurs d'avant divergentes : celle que portait CE bien (son adresse, ses colonnes), comme avant — la place reste « à arbitrer »
  const p = lirePlaceDepuis(anciens, lignes, adresseCle, bCle, l.batiment, instant, (c) => c.lots.includes(lotId));
  const { libBat, ...reste } = p;
  return { ...reste, adresse: immeubleDuBien(l), batiment: bCle === '' ? null : { cle: bCle, libelle: libBat as string, lie: l.batimentLieCle !== null } };
}

/**
 * Les digicodes d'une PLACE désignée par une adresse (« Immeuble » ou adresse d'un bien à créer) et un bâtiment saisi — le pré-remplissage de la
 * création d'un bien. LECTURE SEULE.
 */
export async function digicodesDeLaPlace(immeubleOuAdresse: string, batimentBrut: string | null, instant: Date = new Date(), q: RequeteTx = query): Promise<DigicodesDuBien | null> {
  const adresseCle = await cleDeReferenceDigicode(cleImmeuble(immeubleOuAdresse), q);
  if (adresseCle === '') return null;
  const anciens = await chargerAnciens(q);
  const lignes = await lignesDigicodes([adresseCle], q);
  const bCle = cleBatiment(batimentBrut);
  const p = lirePlaceDepuis(anciens, lignes, adresseCle, bCle, batimentBrut, instant, () => false);
  const { libBat, ...reste } = p;
  return { ...reste, adresse: immeubleOuAdresse.trim(), batiment: bCle === '' ? null : { cle: bCle, libelle: libBat as string, lie: false } };
}

// ── L'ÉCRITURE : LE CHEMIN UNIQUE ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CoproprieteDuCode { cle: string; libelle: string; codePostal: string | null; commune: string | null;
  /** 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3) l'ADRESSE de la copropriété où se trouve le bâtiment (sa clé) */
  adresseCle?: string | null }

export interface EcritureDigicode {
  adresseCle: string;
  adresseLibelle: string;
  /** le bâtiment (libellé saisi ou choisi) ; vide : le code COMMUN de l'adresse */
  batiment: string | null;
  valeur: { digicode?: unknown; code?: unknown };
  /** saisie : première valeur (rien de connu) ; correction : faute de frappe, immédiate ; changement : à une date à venir ; arbitrage : une des
   *  valeurs divergentes d'avant */
  nature: 'saisie' | 'correction' | 'changement' | 'arbitrage';
  /** changement seulement : la date et l'heure d'application (ISO) */
  appliqueLe?: string | null;
  origine: OrigineDigicode;
  lotId?: number | null;
  /** la copropriété de l'adresse : un nouveau bâtiment y entre au registre (476) */
  copropriete?: CoproprieteDuCode | null;
}
export type IssueEcriture = { ok: true; change: boolean; id: number | null } | { ok: false; motif: string };

/** Un refus découvert APRÈS le début des écritures : levé, pour que la transaction soit ANNULÉE (rien n'est écrit). */
export class RefusDigicode extends Error {}


/**
 * 🔴 LE CHEMIN SERVEUR UNIQUE, DANS LA TRANSACTION DE L'APPELANT. Les refus se décident AVANT toute écriture (piège `withTransaction`) ; une
 * place est verrouillée le temps de la décision (deux saisies simultanées ne font pas deux codes). Rien n'est jamais modifié ni effacé : chaque
 * écriture AJOUTE une ligne. Un bien d'où l'on écrit reçoit une ligne de journal (son historique).
 */
/** La longueur permise d'un code dans la base unique : 15 avec la 482, 8 sans elle (la contrainte de la 478). */
export async function longueurMaxCodeDigicode(q: RequeteTx = query): Promise<number> {
  const { rows } = await q<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_digicode_code_longueur_chk') AS ok`)
    .catch(() => ({ rows: [{ ok: false }] }));
  return rows[0]?.ok === true ? MAX_CODE_DIGICODE_UNIFIE : 8;
}

export async function ecrireDigicode(q: RequeteTx, e: EcritureDigicode, auteur: Auteur, instant: Date = new Date()): Promise<IssueEcriture> {
  if (!(await digicodesUnifiesDisponibles())) return { ok: false, motif: 'La base unique des digicodes n’est pas encore installée (migration 478) : rien n’est enregistré.' };
  // 🔴 (Arno, 17/11/2026 : « saisie limitée à 15 caractères […] Un code existant plus long reste affiché tel quel, jamais tronqué en base. Même réglage partout où le composant unique sert. ») — 15 avec la 482, sinon 8 (la base d'avant les refuserait) : refus clair, avant toute écriture
  const v = valeurSaisie(e.valeur, await longueurMaxCodeDigicode());
  if (!v.ok) return v;
  if (e.adresseCle.trim() === '' || e.adresseLibelle.trim() === '') return { ok: false, motif: 'Adresse de la copropriété non désignée : rien n’est enregistré.' };
  const place = placeBatiment(e.batiment);
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`digicode#${e.adresseCle}#${place.cle}`]);
  const lignes = (await lignesDigicodes([e.adresseCle], q)).filter((l) => l.batimentCle === place.cle);
  const anciens = candidatsAnciens(await chargerAnciens(q), e.adresseCle, place.cle);
  const en = codeEnVigueur(lignes, anciens, e.adresseCle, place.cle, instant);
  const connue = en !== null && (en.valeur.digicode !== null || (en.valeur.code ?? '') !== '');
  let appliqueLe = instant.toISOString();
  let nature: LigneDigicode['nature'] = e.nature;
  let corrige: number | null = null;
  let avant: ValeurDigicode = en?.valeur ?? { digicode: null, code: null };
  // ── ① LES REFUS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (e.nature === 'saisie') {
    if (en !== null && en.aArbitrer.length > 0) return { ok: false, motif: MOTIF_A_ARBITRER };
    if (connue) return memeCode(en!.valeur, v.valeur) ? { ok: true, change: false, id: null } : { ok: false, motif: MOTIF_DEJA_CONNU(en!.valeur) };
  } else if (e.nature === 'correction') {
    if (!connue) return { ok: false, motif: MOTIF_RIEN_A_CORRIGER };
    if (en!.aArbitrer.length > 0) return { ok: false, motif: MOTIF_A_ARBITRER };
    if (memeCode(en!.valeur, v.valeur)) return { ok: true, change: false, id: null };
  } else if (e.nature === 'changement') {
    const date = new Date(e.appliqueLe ?? '');
    if (Number.isNaN(date.getTime()) || date.getTime() <= instant.getTime()) return { ok: false, motif: MOTIF_DATE_PASSEE };
    const prevu = changementsAVenir(lignes, e.adresseCle, place.cle, instant)[0];
    if (prevu !== undefined) return { ok: false, motif: MOTIF_CHANGEMENT_PREVU(dateHeure(prevu.appliqueLe)) };
    if (en !== null && en.aArbitrer.length > 0) return { ok: false, motif: MOTIF_A_ARBITRER };
    if (connue && memeCode(en!.valeur, v.valeur)) return { ok: false, motif: 'Le nouveau code est identique au code en vigueur : rien n’est enregistré.' };
    appliqueLe = date.toISOString();
  } else {
    if (en === null || en.source !== 'ancien' || en.aArbitrer.length === 0) return { ok: false, motif: MOTIF_PAS_A_ARBITRER };
    if (!en.aArbitrer.some((c) => memeCode(c.valeur, v.valeur))) return { ok: false, motif: MOTIF_ARBITRAGE_HORS_LISTE };
    avant = { digicode: null, code: null };
  }
  // ── ② LES ÉCRITURES (ajout seul) ─────────────────────────────────────────────────────────────────────────────────────────────────
  if (e.nature === 'correction') {
    if (en!.source === 'unifie') { corrige = en!.ligne!.id; appliqueLe = en!.ligne!.appliqueLe; } else {
      // la valeur d'avant corrigée entre d'abord dans la base unique (« reprise »), pour que l'historique dise « avant → après »
      const depuis = en!.depuis !== null && new Date(en!.depuis).getTime() <= instant.getTime() ? en!.depuis : instant.toISOString();
      const ancienne = valeurSaisie(en!.valeur);
      if (ancienne.ok) {
        corrige = await inserer(q, e, place, ancienne.valeur, depuis, 'reprise', 'reprise', null, null, auteur);
        appliqueLe = depuis;
      } else {
        nature = 'saisie'; // « oui » sans code d'avant : rien de corrigeable à garder — la nouvelle valeur est la première de la base unique
      }
    }
  }
  if (place.cle !== '' && e.copropriete) await inscrireBatiment(q, { ...e.copropriete, adresseCle: e.adresseCle }, place.libelle as string, auteur);
  const id = await inserer(q, e, place, v.valeur, appliqueLe, nature, e.origine, nature === 'correction' ? corrige : null, e.lotId ?? null, auteur);
  if (e.lotId) {
    const quoi = `${nature === 'changement' ? `changement prévu le ${dateHeure(appliqueLe)} — ` : nature === 'correction' ? 'correction — ' : ''}digicode ${place.libelle === null ? 'commun' : `du bâtiment ${place.libelle}`} de ${e.adresseLibelle}`;
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'digicode', $2, $3, $4, $5, $6)`,
      [e.lotId, libelleValeur(avant), libelleValeur(v.valeur), quoi, auteur.id, auteur.libelle]);
  }
  return { ok: true, change: true, id };
}

/** 🔴 (Arno, 17/11/2026) la migration 487 (la nature 'retrait') est-elle en base ? */
export async function retraitDigicodeDisponible(q: RequeteTx = query): Promise<boolean> {
  const { rows } = await q<{ ok: boolean }>(
    `SELECT coalesce(bool_or(pg_get_constraintdef(oid) LIKE '%retrait%'), false) AS ok FROM pg_constraint WHERE conname = 'gestion_digicode_nature_check'`);
  return rows[0]?.ok === true;
}

/**
 * ══ 🔴🔴 RETIRER LE DIGICODE D'UN BÂTIMENT (Arno, 17/11/2026, migration 487) ═════════════════════════════════════════════════════════════════════
 * « code déjà enregistré : fenêtre de confirmation qui dit clairement que le code est RETIRÉ (« Le bâtiment X n'aura plus de digicode à partir de
 * maintenant ; l'ancien code reste dans l'historique ») ; il est marqué retiré, avec la date et l'auteur, jamais effacé de la base ; les biens de ce
 * bâtiment lisent alors le seul digicode copropriété ; la ligne copropriété n'a pas de « − » (on utilise « pas de digicode »). »
 * Dans la transaction de l'appelant : une ligne 'retrait' (maintenant, l'auteur, sans code) — l'ajout seul ; rien n'est effacé ni modifié.
 */
export async function retirerDigicode(q: RequeteTx, e: { adresseCle: string; adresseLibelle: string; batiment: string | null; origine: OrigineDigicode; lotId?: number | null },
  auteur: Auteur, instant: Date = new Date()): Promise<IssueEcriture> {
  if (!(await retraitDigicodeDisponible(q))) return { ok: false, motif: 'Retirer un digicode demande la mise à jour de la base (migration 487) : rien n’est enregistré.' };
  const place = placeBatiment(e.batiment);
  if (place.cle === '') return { ok: false, motif: 'Le digicode copropriété ne se retire pas : cochez « pas de digicode ». Rien n’est enregistré.' };
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`digicode#${e.adresseCle}#${place.cle}`]);
  const lignes = (await lignesDigicodes([e.adresseCle], q)).filter((l) => l.batimentCle === place.cle);
  const en = codeEnVigueur(lignes, candidatsAnciens(await chargerAnciens(q), e.adresseCle, place.cle), e.adresseCle, place.cle, instant);
  if (en === null || (en.valeur.digicode === null && (en.valeur.code ?? '') === '')) return { ok: false, motif: `Le bâtiment ${place.libelle} n’a pas de digicode enregistré : rien à retirer.` };
  if (en.aArbitrer.length > 0) return { ok: false, motif: MOTIF_A_ARBITRER };
  const prevu = changementsAVenir(lignes, e.adresseCle, place.cle, instant)[0];
  if (prevu !== undefined) return { ok: false, motif: MOTIF_CHANGEMENT_PREVU(dateHeure(prevu.appliqueLe)) };
  const id = await inserer(q, { adresseCle: e.adresseCle, adresseLibelle: e.adresseLibelle, batiment: e.batiment, valeur: {}, nature: 'saisie', origine: e.origine },
    place, { digicode: false, code: null }, instant.toISOString(), 'retrait', e.origine, null, e.lotId ?? null, auteur);
  if (e.lotId) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'digicode', $2, $3, $4, $5, $6)`,
      [e.lotId, libelleValeur(en.valeur), 'retiré', `digicode du bâtiment ${place.libelle} de ${e.adresseLibelle} retiré : ses biens lisent le digicode copropriété`, auteur.id, auteur.libelle]);
  }
  return { ok: true, change: true, id };
}

async function inserer(q: RequeteTx, e: EcritureDigicode, place: { cle: string; libelle: string | null }, v: { digicode: boolean; code: string | null }, appliqueLe: string,
  nature: LigneDigicode['nature'], origine: OrigineDigicode, corrige: number | null, lotId: number | null, auteur: Auteur): Promise<number> {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO gestion_digicode (adresse_cle, adresse_libelle, batiment_cle, batiment_libelle, digicode, code, applique_le, nature, origine, lot_id, corrige_id, cree_par, cree_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id::text`,
    [e.adresseCle, e.adresseLibelle.trim(), place.cle, place.libelle, v.digicode, v.code, appliqueLe, nature, origine, lotId, corrige, auteur.id, auteur.libelle]);
  return Number(rows[0].id);
}

/**
 * Un bâtiment (ou une cage) entre au REGISTRE de sa copropriété (476) — la copropriété est créée si elle n'était connue que par ses biens, comme
 * au premier « Valider » de sa fiche. Rend l'identifiant du bâtiment au registre, ou `null` sans la 476.
 */
export async function inscrireBatiment(q: RequeteTx, c: CoproprieteDuCode, libelleBrut: string, auteur: Auteur): Promise<number | null> {
  const b = batimentDe(libelleBrut);
  if (b === null || !(await colonneExisteMemo('gestion_copropriete_batiment', 'batiment_cle'))) return null;
  await q(`INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (cle_immeuble) DO NOTHING`,
    [c.cle, c.libelle, c.codePostal, c.commune, auteur.id, auteur.libelle]);
  const { rows: cp } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1', [c.cle]);
  if (cp[0] === undefined) throw new RefusDigicode('Copropriété introuvable après sa création.');
  // 🔴🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3 : « un « A » est accepté à une autre adresse de la même copropriété, refusé une
  // seconde fois à la même adresse ») le bâtiment entre au registre À SON ADRESSE (le même nom, à une autre adresse : un autre bâtiment) ; sans la 490 : comme avant
  const adresse = (c.adresseCle ?? '').trim() === '' ? null : (c.adresseCle as string);
  if (await registreParAdresse(q)) {
    await q(adresse === null
      ? `INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (copropriete_id, batiment_cle) WHERE adresse_cle IS NULL DO NOTHING`
      : `INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle, adresse_cle) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL DO NOTHING`,
    [cp[0].id, b.cle, b.libelle, b.sorte, auteur.id, auteur.libelle, ...(adresse === null ? [] : [adresse])]);
    await reprendreSiRetire(q, cp[0].id, b.cle, auteur, adresse);
    const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2 AND adresse_cle IS NOT DISTINCT FROM $3',
      [cp[0].id, b.cle, adresse]);
    return rows[0] === undefined ? null : Number(rows[0].id);
  }
  await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (copropriete_id, batiment_cle) DO NOTHING`, [cp[0].id, b.cle, b.libelle, b.sorte, auteur.id, auteur.libelle]);
  // 🔴 (Arno, 17/11/2026, 488) un bâtiment retiré, recréé : il est REPRIS (il reprend sa ligne)
  await reprendreSiRetire(q, cp[0].id, b.cle, auteur);
  const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2', [cp[0].id, b.cle]);
  return rows[0] === undefined ? null : Number(rows[0].id);
}

/**
 * LE LIEN SÛR d'un bien vers son bâtiment (478) : le bâtiment entre au registre de la copropriété s'il n'y est pas, le bien y est relié ; `null`
 * le détache (le bien lit alors le code commun). Le texte « Bâtiment » du bien n'est pas touché. Journalisé dans l'historique du bien.
 */
export async function relierBienAuBatiment(q: RequeteTx, lotId: number, c: CoproprieteDuCode, libelleBrut: string | null, auteur: Auteur): Promise<{ ok: true; change: boolean } | { ok: false; motif: string }> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id'))) return { ok: false, motif: 'Le lien du bien à son bâtiment n’est pas encore installé (migration 478) : rien n’est enregistré.' };
  const { rows: avant } = await q<{ id: string | null; libelle: string | null; immeuble: string | null; adresse: string | null }>(
    `SELECT l.copropriete_batiment_id::text AS id, cb.batiment_libelle AS libelle, l.immeuble, l.adresse FROM gestion_annuaire_lot l LEFT JOIN gestion_copropriete_batiment cb ON cb.id = l.copropriete_batiment_id WHERE l.id = $1 FOR UPDATE OF l`, [lotId]);
  if (avant[0] === undefined) return { ok: false, motif: 'Ce bien n’existe pas.' };
  // 🔴 (lot 3) le bâtiment du bien est à l'ADRESSE DU BIEN (son « Immeuble », sinon son adresse — la règle de sa copropriété)
  const adresseDuBien = c.adresseCle ?? (adresseCleDuBien({ immeuble: avant[0].immeuble ?? null, adresse: avant[0].adresse ?? null }) || null);
  const id = libelleBrut === null || cleBatiment(libelleBrut) === '' ? null : await inscrireBatiment(q, { ...c, adresseCle: adresseDuBien }, libelleBrut, auteur);
  if (libelleBrut !== null && cleBatiment(libelleBrut) !== '' && id === null) return { ok: false, motif: 'Le registre des bâtiments n’est pas installé (migration 476) : rien n’est enregistré.' };
  if (String(id ?? '') === String(avant[0].id ?? '')) return { ok: true, change: false };
  await q('UPDATE gestion_annuaire_lot SET copropriete_batiment_id = $2 WHERE id = $1', [lotId, id]);
  const apres = id === null ? null : batimentDe(libelleBrut)?.libelle ?? null;
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'batiment_copropriete', $2, $3, $4, $5, $6)`,
    [lotId, avant[0].libelle ?? 'aucun', apres ?? 'aucun', `bâtiment du bien dans la copropriété ${c.libelle} (digicode)`, auteur.id, auteur.libelle]);
  return { ok: true, change: true };
}

// ── LA REPRISE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const AUTEUR_REPRISE: Auteur = { id: null, libelle: 'reprise des digicodes dans la base unique (automatique)' };

/**
 * LA REPRISE des valeurs d'avant dans la base unique : À BLANC par défaut (rien n'est écrit, le plan est rendu) ; `reel` écrit une ligne
 * « reprise » par place sans ambiguïté (une transaction par place, revérifiée), avec la date de la valeur d'avant. Les places à arbitrer restent
 * telles quelles. Les anciennes tables ne sont NI vidées NI modifiées.
 */
export async function repriseDigicodesUnifies(o: { reel: boolean }): Promise<{ plan: PlanRepriseUnifiee; ecrites: number }> {
  if (o.reel && !(await digicodesUnifiesDisponibles())) throw new Error('Migration 478 absente : la reprise réelle est impossible (rien n’a été écrit).');
  const anciens = await chargerAnciens();
  const lignes = await lignesDigicodes([...new Set([...anciens.adresses.map((a) => a.adresseCle), ...anciens.lots.map((l) => l.adresseCle)])]);
  const libAdresse = new Map(anciens.adresses.map((a) => [a.adresseCle, a.libelle]));
  const plan = planRepriseUnifiee(anciens, lignes, (k) => libAdresse.get(k) ?? k, (k, b) => {
    for (const im of anciens.immeubles) { const x = im.batiments.find((y) => y.cle === b); if (x !== undefined) return x.libelle; }
    return batimentDe(anciens.lotsBruts.find((l) => adresseCleDuBien(l) === k && batimentCleDuBien(l) === b)?.batiment)?.libelle ?? b.toUpperCase();
  });
  let ecrites = 0;
  if (o.reel) {
    for (const r of plan.aReprendre) {
      const v = valeurSaisie(r.valeur);
      if (!v.ok) continue; // « oui » sans code : rien d'exploitable à reprendre, la valeur d'avant reste lisible
      const depuis = r.depuis ?? new Date().toISOString();
      const fait = await withTransaction(async (q) => {
        await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`digicode#${r.adresseCle}#${r.batimentCle}`]);
        if (lignesDeLaPlace(await lignesDigicodes([r.adresseCle], q), r.adresseCle, r.batimentCle).length > 0) return false;
        await inserer(q, { adresseCle: r.adresseCle, adresseLibelle: r.adresse, batiment: r.batiment, valeur: r.valeur, nature: 'saisie', origine: 'reprise' },
          { cle: r.batimentCle, libelle: r.batiment }, v.valeur, depuis, 'reprise', 'reprise', null, null, AUTEUR_REPRISE);
        return true;
      });
      if (fait) ecrites += 1;
    }
  }
  return { plan, ecrites };
}

// ── LA LECTURE POUR LA FICHE COPROPRIÉTÉ ────────────────────────────────────────────────────────────────────────────────────────────────

export interface PlaceFiche { cle: string; libelle: string | null; code: CodeEnVigueur | null; aVenir: LigneDigicode[]; historique: LigneDigicode[]; nbBiens: number }
export interface DigicodesAdresseUnifies { adresseCle: string; commun: PlaceFiche; batiments: PlaceFiche[]; nbBiens: number }

/**
 * Les digicodes de CHAQUE adresse d'une copropriété, à un instant : le code commun et un code par bâtiment connu (base unique, valeurs d'avant,
 * bâtiments de ses biens), chacun avec ses changements prévus et son historique (lignes de la base unique, annulées comprises). LECTURE SEULE.
 */
export async function digicodesDesAdresses(adresseCles: readonly string[], instant: Date = new Date(), q: RequeteTx = query): Promise<DigicodesAdresseUnifies[]> {
  const anciens = await chargerAnciens(q);
  const toutes = await lignesDigicodes(adresseCles, q);
  return adresseCles.map((adresseCle) => {
    const lignes = toutes.filter((l) => l.adresseCle === adresseCle);
    const cles = new Map<string, string>();
    for (const l of lignes) if (l.batimentCle !== '') cles.set(l.batimentCle, l.batimentLibelle ?? l.batimentCle.toUpperCase());
    const legacy = new Set(anciens.adresses.filter((a) => a.adresseCle === adresseCle).map((a) => a.cleLegacy));
    for (const l of anciens.lots.filter((x) => x.adresseCle === adresseCle)) { legacy.add(l.cleLegacy); if (l.batimentCle !== '' && !cles.has(l.batimentCle)) cles.set(l.batimentCle, batimentDe(anciens.lotsBruts.find((x) => x.id === l.id)?.batiment)?.libelle ?? l.batimentCle.toUpperCase()); }
    for (const im of anciens.immeubles.filter((x) => legacy.has(x.cleLegacy))) for (const b of im.batiments) if (!cles.has(b.cle)) cles.set(b.cle, b.libelle);
    const ici = anciens.lots.filter((x) => x.adresseCle === adresseCle);
    const place = (cle: string, libelle: string | null): PlaceFiche => ({ cle, libelle, code: codeEnVigueur(lignes, candidatsAnciens(anciens, adresseCle, cle), adresseCle, cle, instant),
      aVenir: changementsAVenir(lignes, adresseCle, cle, instant), historique: lignes.filter((l) => l.batimentCle === cle),
      nbBiens: cle === '' ? ici.length : ici.filter((x) => x.batimentCle === cle).length });
    return { adresseCle, commun: place('', null), nbBiens: anciens.lots.filter((x) => x.adresseCle === adresseCle).length,
      batiments: [...cles.entries()].map(([cle, libelle]) => place(cle, libelle)).sort((a, b) => (a.libelle ?? '').localeCompare(b.libelle ?? '', 'fr', { numeric: true, sensitivity: 'base' })) };
  });
}

/**
 * 🔴 (« Digicodes unifiés », lot 5) ANNULER un changement PRÉVU (pas encore appliqué), dans la transaction de l'appelant : la ligne est marquée
 * annulée (qui, quand) — jamais effacée ; l'historique la montre « annulée ». Refus clair sinon (déjà appliqué, déjà annulé, autre adresse).
 */
export async function annulerChangement(q: RequeteTx, adresseCle: string, ligneId: number, auteur: Auteur): Promise<IssueEcriture> {
  if (!(await digicodesUnifiesDisponibles())) return { ok: false, motif: 'La base unique des digicodes n’est pas encore installée (migration 478) : rien n’est enregistré.' };
  const { rows } = await q<{ id: string }>(
    `UPDATE gestion_digicode SET annule_le = now(), annule_par_libelle = $3
      WHERE id = $1 AND adresse_cle = $2 AND nature = 'changement' AND annule_le IS NULL AND applique_le > now() RETURNING id::text`, [ligneId, adresseCle, auteur.libelle]);
  return rows[0] === undefined ? { ok: false, motif: 'Ce changement n’est plus annulable (déjà appliqué ou déjà annulé) : rechargez la fiche. Rien n’est enregistré.' }
    : { ok: true, change: true, id: ligneId };
}

/**
 * 🔴 (Arno, 17/11/2026 : « Le mail à la Gestion est rangé dans l'historique de la copropriété et des biens concernés. ») Les mails à la Gestion des
 * changements de digicode, adresse par adresse : ceux rangés dans les biens de l'adresse (le même mail, rangé dans plusieurs biens, ne compte qu'une
 * fois), les plus récents d'abord. Vide sans la 484. LECTURE SEULE.
 */
export async function mailsGestionDesAdresses(adresseCles: readonly string[], q: RequeteTx = query): Promise<Map<string, MailGestionHisto[]>> {
  const out = new Map<string, MailGestionHisto[]>(adresseCles.map((c) => [c, []]));
  if (adresseCles.length === 0 || !(await colonneExisteMemo('gestion_location_mail_avis', 'sorte'))) return out;
  const lots = (await chargerAnciens(q)).lotsBruts.map((l) => ({ id: l.id, cle: adresseCleDuBien(l) })).filter((l) => out.has(l.cle));
  if (lots.length === 0) return out;
  const { rows } = await q<{ lot: string; cle: string; objet: string; le: string | null; statut: string }>(
    `SELECT lot_id::text AS lot, coalesce(message_id, objet || '#' || coalesce(envoye_le::text, id::text)) AS cle, objet, to_json(envoye_le)#>>'{}' AS le, statut
       FROM gestion_location_mail_avis WHERE sorte = 'digicode_gestion' AND lot_id = ANY($1::bigint[]) ORDER BY envoye_le DESC NULLS LAST, id DESC`, [lots.map((l) => l.id)]);
  for (const r of rows) {
    const adresse = lots.find((l) => l.id === Number(r.lot))?.cle;
    if (adresse === undefined) continue;
    const liste = out.get(adresse)!;
    if (!liste.some((m) => m.cle === r.cle)) liste.push({ cle: r.cle, objet: r.objet, le: r.le, statut: r.statut });
  }
  return out;
}
