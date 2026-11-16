import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { cleBatiment, cleImmeubleAdresse, libelleValeur, type ValeurDigicode } from '../location/digicodeImmeuble';
import { digicodeBatimentDisponible, digicodeImmeubleDisponible } from '../location/digicodeImmeubleRepo';
import { batimentDe } from './batimentsCopropriete';
import { immeubleDuBien } from './copropriete';
import { cleImmeuble } from './syndics';
import {
  candidatsAnciens, changementsAVenir, codeEnVigueur, lignesDeLaPlace, memeCode, MOTIF_A_ARBITRER, MOTIF_ARBITRAGE_HORS_LISTE, MOTIF_CHANGEMENT_PREVU,
  MOTIF_DATE_PASSEE, MOTIF_DEJA_CONNU, MOTIF_PAS_A_ARBITRER, MOTIF_RIEN_A_CORRIGER, placeBatiment, planRepriseUnifiee, valeurSaisie,
  type CodeEnVigueur, type DonneesAnciennes, type LigneDigicode, type OrigineDigicode, type PlanRepriseUnifiee,
} from './digicodes';

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
  lot_id::text, corrige_id::text, to_json(annule_le)#>>'{}' AS annule_le, to_json(cree_le)#>>'{}' AS cree_le, cree_par_libelle`;
interface LigneSql { id: string; adresse_cle: string; adresse_libelle: string; batiment_cle: string; batiment_libelle: string | null; digicode: boolean; code: string | null;
  applique_le: string; nature: LigneDigicode['nature']; origine: OrigineDigicode; lot_id: string | null; corrige_id: string | null; annule_le: string | null; cree_le: string; cree_par_libelle: string }
const versLigne = (r: LigneSql): LigneDigicode => ({ id: Number(r.id), adresseCle: r.adresse_cle, adresseLibelle: r.adresse_libelle, batimentCle: r.batiment_cle, batimentLibelle: r.batiment_libelle,
  digicode: r.digicode, code: r.code, appliqueLe: r.applique_le, nature: r.nature, origine: r.origine, lotId: r.lot_id === null ? null : Number(r.lot_id),
  corrigeId: r.corrige_id === null ? null : Number(r.corrige_id), annuleLe: r.annule_le, creeLe: r.cree_le, creeParLibelle: r.cree_par_libelle });

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
  if (await digicodeImmeubleDisponible()) {
    const { rows: im } = await q<{ id: string; cle: string; voie: string; digicode: boolean | null; code: string | null; depuis: string | null }>(
      `SELECT id::text, cle_adresse AS cle, voie, digicode, digicode_code AS code, to_json(coalesce(modifie_le, cree_le))#>>'{}' AS depuis FROM gestion_immeuble ORDER BY id`);
    const bats = (await digicodeBatimentDisponible())
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
}

/** Les digicodes d'un BIEN à un instant (par défaut : maintenant). `null` : bien inconnu, ou sans adresse. LECTURE SEULE. */
export async function digicodesDuBien(lotId: number, instant: Date = new Date(), q: RequeteTx = query): Promise<DigicodesDuBien | null> {
  const anciens = await chargerAnciens(q);
  const l = anciens.lotsBruts.find((x) => x.id === lotId);
  if (l === undefined) return null;
  const adresseCle = adresseCleDuBien(l);
  if (adresseCle === '') return null;
  const lignes = await lignesDigicodes([adresseCle], q);
  const bCle = batimentCleDuBien(l);
  const libBat = bCle === '' ? null : (lignes.find((x) => x.batimentCle === bCle)?.batimentLibelle ?? batimentDe(l.batiment)?.libelle ?? bCle.toUpperCase());
  // à valeurs d'avant divergentes : celle que portait CE bien (son adresse, ses colonnes), comme avant — la place reste « à arbitrer »
  const prefere = (c: { lots: number[] }): boolean => c.lots.includes(lotId);
  const commun = codeEnVigueur(lignes, candidatsAnciens(anciens, adresseCle, ''), adresseCle, '', instant, prefere);
  const codeBatiment = bCle === '' ? null : codeEnVigueur(lignes, candidatsAnciens(anciens, adresseCle, bCle), adresseCle, bCle, instant, prefere);
  const aVenir = [...changementsAVenir(lignes, adresseCle, '', instant), ...(bCle === '' ? [] : changementsAVenir(lignes, adresseCle, bCle, instant))]
    .sort((a, b) => new Date(a.appliqueLe).getTime() - new Date(b.appliqueLe).getTime())
    .map((x) => ({ batiment: x.batimentLibelle, valeur: { digicode: x.digicode, code: x.code }, appliqueLe: x.appliqueLe }));
  return { adresseCle, adresse: immeubleDuBien(l), batiment: bCle === '' ? null : { cle: bCle, libelle: libBat as string, lie: l.batimentLieCle !== null }, commun, codeBatiment, aVenir };
}

// ── L'ÉCRITURE : LE CHEMIN UNIQUE ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CoproprieteDuCode { cle: string; libelle: string; codePostal: string | null; commune: string | null }

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

/** La date lisible (Paris) d'une ligne : « 16/11/2026 à 09:30 ». PUR. */
export const dateHeure = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');

/**
 * 🔴 LE CHEMIN SERVEUR UNIQUE, DANS LA TRANSACTION DE L'APPELANT. Les refus se décident AVANT toute écriture (piège `withTransaction`) ; une
 * place est verrouillée le temps de la décision (deux saisies simultanées ne font pas deux codes). Rien n'est jamais modifié ni effacé : chaque
 * écriture AJOUTE une ligne. Un bien d'où l'on écrit reçoit une ligne de journal (son historique).
 */
export async function ecrireDigicode(q: RequeteTx, e: EcritureDigicode, auteur: Auteur, instant: Date = new Date()): Promise<IssueEcriture> {
  if (!(await digicodesUnifiesDisponibles())) return { ok: false, motif: 'La base unique des digicodes n’est pas encore installée (migration 478) : rien n’est enregistré.' };
  const v = valeurSaisie(e.valeur);
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
  if (place.cle !== '' && e.copropriete) await inscrireBatiment(q, e.copropriete, place.libelle as string, auteur);
  const id = await inserer(q, e, place, v.valeur, appliqueLe, nature, e.origine, nature === 'correction' ? corrige : null, e.lotId ?? null, auteur);
  if (e.lotId) {
    const quoi = `${nature === 'changement' ? `changement prévu le ${dateHeure(appliqueLe)} — ` : nature === 'correction' ? 'correction — ' : ''}digicode ${place.libelle === null ? 'commun' : `du bâtiment ${place.libelle}`} de ${e.adresseLibelle}`;
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'digicode', $2, $3, $4, $5, $6)`,
      [e.lotId, libelleValeur(avant), libelleValeur(v.valeur), quoi, auteur.id, auteur.libelle]);
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
  await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (copropriete_id, batiment_cle) DO NOTHING`, [cp[0].id, b.cle, b.libelle, b.sorte, auteur.id, auteur.libelle]);
  const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2', [cp[0].id, b.cle]);
  return rows[0] === undefined ? null : Number(rows[0].id);
}

/**
 * LE LIEN SÛR d'un bien vers son bâtiment (478) : le bâtiment entre au registre de la copropriété s'il n'y est pas, le bien y est relié ; `null`
 * le détache (le bien lit alors le code commun). Le texte « Bâtiment » du bien n'est pas touché. Journalisé dans l'historique du bien.
 */
export async function relierBienAuBatiment(q: RequeteTx, lotId: number, c: CoproprieteDuCode, libelleBrut: string | null, auteur: Auteur): Promise<{ ok: true; change: boolean } | { ok: false; motif: string }> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id'))) return { ok: false, motif: 'Le lien du bien à son bâtiment n’est pas encore installé (migration 478) : rien n’est enregistré.' };
  const { rows: avant } = await q<{ id: string | null; libelle: string | null }>(
    `SELECT l.copropriete_batiment_id::text AS id, cb.batiment_libelle AS libelle FROM gestion_annuaire_lot l LEFT JOIN gestion_copropriete_batiment cb ON cb.id = l.copropriete_batiment_id WHERE l.id = $1 FOR UPDATE OF l`, [lotId]);
  if (avant[0] === undefined) return { ok: false, motif: 'Ce bien n’existe pas.' };
  const id = libelleBrut === null || cleBatiment(libelleBrut) === '' ? null : await inscrireBatiment(q, c, libelleBrut, auteur);
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
