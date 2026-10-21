import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import {
  cleBatiment, cleImmeubleAdresse, libelleBatiment, libelleValeur, memeValeur, mentionDigicode, mentionDigicodeBatiment, MENTION_CODE_GENERAL,
  planReprise, verifierDigicode, type AdresseImmeuble, type ValeurDigicode,
} from './digicodeImmeuble';
import { adresseAffichee } from './mailNouvelleLocation';

/**
 * ══ 🔴🔴 LE DIGICODE PORTÉ PAR L'IMMEUBLE (Arno, 21/10/2026, migration 396). IMPUR (base). ═════════════════════════════════
 *
 * STOCKAGE UNIQUE : `gestion_immeuble` (une ligne par adresse normalisée), jamais une copie sur les biens. Toutes les fiches
 * (immeuble / syndic, bien, « Nouveau bien », résumé, sortie de locataire, mail « Nouvelle location ») lisent ICI.
 * Un immeuble est CRÉÉ à la première saisie d'un digicode pour son adresse (adresse seule, sans syndic).
 * Le syndic n'intervient nulle part : changer de syndic ou ne plus en avoir ne change rien.
 * Chaque changement est journalisé (`gestion_immeuble_digicode_journal` : avant, après, qui, quand, depuis quelle fiche).
 * 🔴 SANS LA 396 : rien ne change — les fiches lisent et écrivent les colonnes du bien, comme avant.
 */

export function digicodeImmeubleDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_immeuble_digicode_journal', 'immeuble_id');
}

/** Arno (21/10/2026, migration 399) — un digicode PAR BÂTIMENT. Sans la 399 : un seul code par adresse, comme avant. */
export function digicodeBatimentDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_immeuble_digicode_journal', 'batiment_cle');
}

export type DepuisDigicode = 'fiche_syndic' | 'fiche_bien' | 'nouveau_bien' | 'reprise';

export interface DigicodeLu extends ValeurDigicode {
  /** `immeuble` : la valeur de l'immeuble ; `bien` : l'ANCIENNE valeur propre au bien (l'immeuble n'en a pas encore — reprise
   * « à arbitrer ») ; `null` : rien de connu. */
  source: 'immeuble' | 'bien' | null;
  adresse: AdresseImmeuble;
  /** « Commun aux N biens du bâtiment B, … » / « … de l'adresse … » ; `null` sans adresse exploitable. */
  mention: string | null;
  nbBiens: number;
  /**
   * Arno (21/10/2026, 399) — le bâtiment DEMANDÉ (libellé affiché, « B »), `null` sans bâtiment ; et d'où vient la valeur :
   * `batiment` (le code propre du bâtiment) ou `general` (le code général de l'adresse). Sans la 399 : toujours `general`.
   */
  batiment: string | null;
  portee: 'batiment' | 'general';
}

/** Un bâtiment connu à une adresse (fiche immeuble / syndic) : déduit des biens, ou ajouté à la main. */
export interface DigicodeBatiment extends ValeurDigicode { cle: string; libelle: string; nbBiens: number; mention: string }

/** Les digicodes d'une adresse : le code général et un code par bâtiment connu (fiche immeuble / syndic). */
export interface DigicodesAdresse { general: DigicodeLu; batiments: DigicodeBatiment[]; parBatiment: boolean }

/** L'adresse postale d'un bien (la sienne). */
export async function adresseDuLot(lotId: number): Promise<AdresseImmeuble | null> {
  const { rows } = await query<{ voie: string | null; cp: string | null; commune: string | null }>(
    'SELECT adresse AS voie, code_postal AS cp, commune FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  return rows[0] === undefined ? null : { voie: rows[0].voie, codePostal: rows[0].cp, commune: rows[0].commune };
}

/** Les biens (du portefeuille) dont l'adresse normalisée est celle-ci : même code postal, puis la même clé. */
export async function biensDeLAdresse(a: AdresseImmeuble, q: RequeteTx = query): Promise<number[]> {
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return [];
  const sortie = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? ' AND sorti_portefeuille_le IS NULL' : '';
  const { rows } = await q<{ id: string; voie: string | null; cp: string | null; commune: string | null }>(
    `SELECT id::text, adresse AS voie, code_postal AS cp, commune FROM gestion_annuaire_lot
      WHERE regexp_replace(coalesce(code_postal, ''), '\\s', '', 'g') = $1${sortie} ORDER BY id`, [(a.codePostal ?? '').replace(/\s/g, '')]);
  return rows.filter((r) => cleImmeubleAdresse({ voie: r.voie, codePostal: r.cp, commune: r.commune }) === cle).map((r) => Number(r.id));
}

/** Les biens de l'adresse avec leur bâtiment (brut) : pour compter les biens d'un bâtiment, et déduire les bâtiments connus. */
async function biensDeLAdresseDetail(a: AdresseImmeuble, q: RequeteTx = query): Promise<{ id: number; batiment: string | null }[]> {
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return [];
  const sortie = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? ' AND sorti_portefeuille_le IS NULL' : '';
  const bat = (await colonneExisteMemo('gestion_annuaire_lot', 'batiment')) ? 'batiment' : 'NULL::text';
  const { rows } = await q<{ id: string; voie: string | null; cp: string | null; commune: string | null; batiment: string | null }>(
    `SELECT id::text, adresse AS voie, code_postal AS cp, commune, ${bat} AS batiment FROM gestion_annuaire_lot
      WHERE regexp_replace(coalesce(code_postal, ''), '\\s', '', 'g') = $1${sortie} ORDER BY id`, [(a.codePostal ?? '').replace(/\s/g, '')]);
  return rows.filter((r) => cleImmeubleAdresse({ voie: r.voie, codePostal: r.cp, commune: r.commune }) === cle).map((r) => ({ id: Number(r.id), batiment: r.batiment }));
}

interface BatimentSql { cle: string; libelle: string; digicode: boolean | null; code: string | null }

async function batimentsDeLImmeuble(immeubleId: number | null, q: RequeteTx = query): Promise<BatimentSql[]> {
  if (immeubleId === null || !(await digicodeBatimentDisponible())) return [];
  const { rows } = await q<BatimentSql>(
    'SELECT batiment_cle AS cle, batiment_libelle AS libelle, digicode, digicode_code AS code FROM gestion_immeuble_batiment WHERE immeuble_id = $1 ORDER BY batiment_cle', [immeubleId]);
  return rows;
}

const connue = (v: { digicode: boolean | null; code: string | null }): boolean => v.digicode !== null || (v.code ?? '') !== '';
const majuscule = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface ImmeubleSql { id: string; digicode: boolean | null; code: string | null }

async function immeubleParCle(cle: string, q: RequeteTx = query, verrou = false): Promise<ImmeubleSql | null> {
  const { rows } = await q<ImmeubleSql>(
    `SELECT id::text, digicode, digicode_code AS code FROM gestion_immeuble WHERE cle_adresse = $1${verrou ? ' FOR UPDATE' : ''}`, [cle]);
  return rows[0] ?? null;
}

/**
 * Tout ce qu'une adresse sait de ses digicodes : l'immeuble, ses bâtiments (déduits des biens + ceux de la table), les biens
 * de chaque bâtiment. Le cœur commun des lectures. `null` sans la 396.
 */
async function etatAdresse(a: AdresseImmeuble, q: RequeteTx = query) {
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return null;
  const im = await immeubleParCle(cle, q);
  const biensAdr = await biensDeLAdresseDetail(a, q);
  const parBatiment = await digicodeBatimentDisponible();
  const lignes = await batimentsDeLImmeuble(im === null ? null : Number(im.id), q);
  const batiments = new Map<string, { libelle: string; valeur: ValeurDigicode | null; nb: number }>();
  if (parBatiment) {
    for (const l of lignes) batiments.set(l.cle, { libelle: l.libelle, valeur: connue(l) ? { digicode: l.digicode, code: l.code } : null, nb: 0 });
    for (const b of biensAdr) {
      const k = cleBatiment(b.batiment);
      if (k === '') continue;
      const x = batiments.get(k) ?? { libelle: libelleBatiment(b.batiment) as string, valeur: null, nb: 0 };
      x.nb += 1; batiments.set(k, x);
    }
  }
  // Les biens qui lisent le code général : sans bâtiment, ou dont le bâtiment n'a pas de code propre.
  const nbGeneral = biensAdr.filter((b) => { const k = parBatiment ? cleBatiment(b.batiment) : ''; return k === '' || (batiments.get(k)?.valeur ?? null) === null; }).length;
  const general: ValeurDigicode | null = im !== null && connue(im) ? { digicode: im.digicode, code: im.code } : null;
  return { cle, im, biensAdr, parBatiment, batiments, nbGeneral, general };
}

/**
 * Le digicode d'une ADRESSE, pour un BÂTIMENT donné (ou le code général sans bâtiment) — fiche immeuble / syndic, « Nouveau
 * bien », fiche de bien. Le bâtiment sans code propre lit le code général, avec la mention « code général de l'adresse ».
 * `null` sans la 396.
 */
export async function lireDigicodeAdresse(a: AdresseImmeuble, batimentBrut: string | null = null, q: RequeteTx = query): Promise<DigicodeLu | null> {
  if (!(await digicodeImmeubleDisponible())) return null;
  const e = await etatAdresse(a, q);
  if (e === null) return { digicode: null, code: null, source: null, adresse: a, mention: null, nbBiens: 0, batiment: null, portee: 'general' };
  if (!e.parBatiment) {
    // Sans la 399 : un seul code par adresse, exactement comme avant.
    return { digicode: e.general?.digicode ?? null, code: e.general?.code ?? null, source: e.general === null ? null : 'immeuble', adresse: a,
      mention: mentionDigicode(a, e.biensAdr.length), nbBiens: e.biensAdr.length, batiment: null, portee: 'general' };
  }
  const k = cleBatiment(batimentBrut);
  const bat = k === '' ? undefined : e.batiments.get(k);
  const libelle = k === '' ? null : bat?.libelle ?? libelleBatiment(batimentBrut);
  if (bat !== undefined && bat.valeur !== null) {
    return { ...bat.valeur, source: 'immeuble', adresse: a, mention: mentionDigicodeBatiment(a, bat.libelle, bat.nb), nbBiens: bat.nb, batiment: bat.libelle, portee: 'batiment' };
  }
  const commun = mentionDigicodeBatiment(a, null, e.nbGeneral);
  const mention = `${majuscule(MENTION_CODE_GENERAL)}${libelle === null ? '' : ` (le bâtiment ${libelle} n’a pas de code propre)`} · ${commun}`;
  return { digicode: e.general?.digicode ?? null, code: e.general?.code ?? null, source: e.general === null ? null : 'immeuble', adresse: a,
    mention, nbBiens: e.nbGeneral, batiment: libelle, portee: 'general' };
}

/**
 * Les digicodes d'une adresse (fiche immeuble / syndic, rose) : le « Code général » et une ligne par bâtiment connu (déduit des
 * biens, ou ajouté à la main). `null` sans la 396.
 */
export async function lireDigicodesAdresse(a: AdresseImmeuble): Promise<DigicodesAdresse | null> {
  const general = await lireDigicodeAdresse(a);
  if (general === null) return null;
  const e = await etatAdresse(a);
  if (e === null || !e.parBatiment) return { general, batiments: [], parBatiment: e?.parBatiment ?? false };
  const g = { ...general, mention: mentionDigicodeBatiment(a, null, e.nbGeneral) };
  const batiments = [...e.batiments.entries()]
    .map(([cle, b]) => ({ cle, libelle: b.libelle, digicode: b.valeur?.digicode ?? null, code: b.valeur?.code ?? null, nbBiens: b.nb, mention: mentionDigicodeBatiment(a, b.libelle, b.nb) }))
    .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr', { numeric: true, sensitivity: 'base' }));
  return { general: g, batiments, parBatiment: true };
}

/**
 * Le digicode d'un BIEN : celui de SON bâtiment, sinon le code général de son adresse ; tant que l'immeuble n'a rien, l'ancienne
 * valeur du bien reste lisible (`source: 'bien'`). `null` sans la 396 (l'appelant lit alors les colonnes du bien, comme avant).
 * `q` : la transaction de l'appelant (lire le bâtiment qu'elle vient d'écrire).
 */
export async function lireDigicodeDuLot(lotId: number, q: RequeteTx = query): Promise<DigicodeLu | null> {
  if (!(await digicodeImmeubleDisponible())) return null;
  const bat = (await colonneExisteMemo('gestion_annuaire_lot', 'batiment')) ? 'batiment' : 'NULL::text';
  const { rows } = await q<{ voie: string | null; cp: string | null; commune: string | null; batiment: string | null; digicode: boolean | null; code: string | null }>(
    `SELECT adresse AS voie, code_postal AS cp, commune, ${bat} AS batiment, digicode, digicode_code AS code FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  const l = rows[0];
  if (l === undefined) return null;
  const lu = await lireDigicodeAdresse({ voie: l.voie, codePostal: l.cp, commune: l.commune }, l.batiment, q);
  if (lu === null) return null;
  if (lu.source === 'immeuble') return lu;
  const ancien = l.digicode !== null || (l.code ?? '').trim() !== '';
  return ancien ? { ...lu, digicode: l.digicode, code: l.code, source: 'bien' } : lu;
}

/**
 * ÉCRIT le digicode d'une adresse, DANS la transaction de l'appelant : celui du BÂTIMENT donné (Arno, 21/10/2026, 399), ou le
 * code général sans bâtiment (sans la 399 : toujours le code de l'adresse, comme avant). L'immeuble (et le bâtiment) est créé
 * s'il n'existe pas (adresse seule, sans syndic) ; rien n'est écrit si la valeur ne change pas ; le changement est journalisé,
 * bâtiment compris. Rend `{ change }` ; lève un refus lisible sur une saisie invalide ou une adresse sans voie.
 */
export async function enregistrerDigicodeDans(q: RequeteTx, a: AdresseImmeuble, brut: { digicode?: unknown; code?: unknown }, auteur: Auteur,
  depuis: DepuisDigicode, lotId: number | null = null, batimentBrut: string | null = null): Promise<{ ok: true; change: boolean; immeubleId: number } | { ok: false; motif: string }> {
  const v = verifierDigicode(brut);
  if (!v.ok) return v;
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return { ok: false, motif: 'Adresse incomplète : le digicode se range sur l’immeuble de l’adresse (numéro et voie).' };
  const parBatiment = await digicodeBatimentDisponible();
  const kBat = parBatiment ? cleBatiment(batimentBrut) : '';
  const libBat = kBat === '' ? null : libelleBatiment(batimentBrut) as string;
  await q(
    `INSERT INTO gestion_immeuble (cle_adresse, voie, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (cle_adresse) DO NOTHING`, [cle, (a.voie ?? '').trim(), a.codePostal, a.commune, auteur.id, auteur.libelle]);
  const im = await immeubleParCle(cle, q, true);
  if (im === null) return { ok: false, motif: 'Immeuble introuvable après sa création.' };
  let avant: ValeurDigicode;
  if (kBat === '') {
    avant = { digicode: im.digicode, code: im.code };
    if (memeValeur(avant, v.valeur)) return { ok: true, change: false, immeubleId: Number(im.id) };
    await q('UPDATE gestion_immeuble SET digicode = $2, digicode_code = $3, modifie_le = now(), modifie_par_libelle = $4 WHERE id = $1',
      [Number(im.id), v.valeur.digicode, v.valeur.code, auteur.libelle]);
  } else {
    await q(
      `INSERT INTO gestion_immeuble_batiment (immeuble_id, batiment_cle, batiment_libelle, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (immeuble_id, batiment_cle) DO NOTHING`, [Number(im.id), kBat, libBat, auteur.id, auteur.libelle]);
    const { rows } = await q<{ id: string; digicode: boolean | null; code: string | null }>(
      'SELECT id::text, digicode, digicode_code AS code FROM gestion_immeuble_batiment WHERE immeuble_id = $1 AND batiment_cle = $2 FOR UPDATE', [Number(im.id), kBat]);
    const b = rows[0];
    if (b === undefined) return { ok: false, motif: 'Bâtiment introuvable après sa création.' };
    avant = { digicode: b.digicode, code: b.code };
    if (memeValeur(avant, v.valeur)) return { ok: true, change: false, immeubleId: Number(im.id) };
    await q('UPDATE gestion_immeuble_batiment SET digicode = $2, digicode_code = $3, modifie_le = now(), modifie_par_libelle = $4 WHERE id = $1',
      [Number(b.id), v.valeur.digicode, v.valeur.code, auteur.libelle]);
  }
  await q(
    `INSERT INTO gestion_immeuble_digicode_journal (immeuble_id, avant_digicode, avant_code, apres_digicode, apres_code, depuis, lot_id, auteur_id, auteur_libelle${parBatiment ? ', batiment_cle, batiment_libelle' : ''})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9${parBatiment ? ', $10, $11' : ''})`,
    [Number(im.id), avant.digicode, avant.code, v.valeur.digicode, v.valeur.code, depuis, lotId, auteur.id, auteur.libelle,
      ...(parBatiment ? [kBat === '' ? null : kBat, libBat] : [])]);
  if (lotId !== null) {
    const quoi = libBat === null
      ? (parBatiment ? `code général de l’immeuble ${(a.voie ?? '').trim()} (biens sans code de bâtiment)` : `digicode de l’immeuble ${(a.voie ?? '').trim()} (commun à tous ses biens)`)
      : `digicode du bâtiment ${libBat} de l’immeuble ${(a.voie ?? '').trim()} (commun aux biens de ce bâtiment)`;
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
             VALUES ('annuaire_lot', $1, 'digicode_immeuble', $2, $3, $4, $5, $6)`,
      [lotId, libelleValeur(avant), libelleValeur(v.valeur), quoi, auteur.id, auteur.libelle]);
  }
  return { ok: true, change: true, immeubleId: Number(im.id) };
}

/** Le même geste, dans sa propre transaction (fiche immeuble / syndic). */
export async function enregistrerDigicode(a: AdresseImmeuble, brut: { digicode?: unknown; code?: unknown }, auteur: Auteur, depuis: DepuisDigicode,
  lotId: number | null = null, batimentBrut: string | null = null): Promise<{ ok: true; change: boolean } | { ok: false; motif: string }> {
  if (!(await digicodeImmeubleDisponible())) return { ok: false, motif: 'Le digicode de l’immeuble n’est pas encore installé (migration 396).' };
  if (cleBatiment(batimentBrut) !== '' && !(await digicodeBatimentDisponible())) {
    return { ok: false, motif: 'Le digicode par bâtiment n’est pas encore installé (migration 399) : rien n’a été modifié.' };
  }
  return withTransaction((q) => enregistrerDigicodeDans(q, a, brut, auteur, depuis, lotId, batimentBrut));
}

/** Le journal d'un immeuble (le plus récent d'abord). */
export async function journalDigicode(a: AdresseImmeuble): Promise<{ le: string; avant: string; apres: string; par: string; depuis: DepuisDigicode; batiment: string | null }[]> {
  if (!(await digicodeImmeubleDisponible())) return [];
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return [];
  const bat = (await digicodeBatimentDisponible()) ? 'j.batiment_libelle' : 'NULL::text';
  const { rows } = await query<{ le: string; ad: boolean | null; ac: string | null; pd: boolean | null; pc: string | null; par: string; depuis: DepuisDigicode; batiment: string | null }>(
    `SELECT j.le::text, j.avant_digicode AS ad, j.avant_code AS ac, j.apres_digicode AS pd, j.apres_code AS pc, j.auteur_libelle AS par, j.depuis, ${bat} AS batiment
       FROM gestion_immeuble_digicode_journal j JOIN gestion_immeuble i ON i.id = j.immeuble_id WHERE i.cle_adresse = $1 ORDER BY j.le DESC, j.id DESC`, [cle]);
  return rows.map((r) => ({ le: r.le, avant: libelleValeur({ digicode: r.ad, code: r.ac }), apres: libelleValeur({ digicode: r.pd, code: r.pc }), par: r.par, depuis: r.depuis, batiment: r.batiment }));
}

// ── LA REPRISE DES DIGICODES DÉJÀ SAISIS SUR DES BIENS (script `reprendre-digicodes-immeubles.ts`) ─────────────────────────

export interface RapportReprise {
  reel: boolean;
  biensAvecDigicode: number;
  /** Passés (ou qui passeraient, à blanc) sur l'immeuble. */
  repris: { adresse: string; valeur: string; lots: number[] }[];
  /** Déjà sur l'immeuble, même valeur : rien à faire. */
  dejaRepris: { adresse: string; valeur: string }[];
  /** À ARBITRER : codes différents à la même adresse (ou un immeuble déjà renseigné autrement) — rien n'est choisi. */
  aArbitrer: { adresse: string; raison: string; lots: { id: number; numero: string | null; valeur: string }[] }[];
  sansAdresse: number[];
}

/**
 * LA REPRISE (Arno, 21/10/2026) : À BLANC par défaut (rien n'est écrit) ; `reel` écrit sur les immeubles, une transaction par
 * adresse, journalisée « reprise ». Les colonnes des biens ne sont NI vidées NI modifiées : l'ancien code reste lisible.
 */
export async function executerRepriseDigicodes(o: { reel: boolean }): Promise<RapportReprise> {
  if (o.reel && !(await digicodeImmeubleDisponible())) throw new Error('Migration 396 absente : la reprise réelle est impossible (rien n’a été écrit).');
  const { rows } = await query<{ id: string; numero: string | null; voie: string | null; cp: string | null; commune: string | null; digicode: boolean | null; code: string | null }>(
    `SELECT id::text, wippimmo_id AS numero, adresse AS voie, code_postal AS cp, commune, digicode, digicode_code AS code FROM gestion_annuaire_lot
      WHERE digicode IS NOT NULL OR nullif(btrim(digicode_code), '') IS NOT NULL ORDER BY id`);
  const plan = planReprise(rows.map((r) => ({ id: Number(r.id), numero: r.numero, voie: r.voie, codePostal: r.cp, commune: r.commune, digicode: r.digicode, code: r.code })));
  const avec396 = await digicodeImmeubleDisponible();
  const rapport: RapportReprise = { reel: o.reel, biensAvecDigicode: rows.length, repris: [], dejaRepris: [], aArbitrer: [], sansAdresse: plan.sansAdresse };
  const AUTEUR: Auteur = { id: null, libelle: 'reprise des digicodes (automatique)' };
  for (const a of plan.aArbitrer) {
    rapport.aArbitrer.push({ adresse: adresseAffichee(a.adresse), raison: 'codes différents à la même adresse',
      lots: a.lots.map((l) => ({ id: l.id, numero: l.numero, valeur: libelleValeur({ digicode: l.digicode, code: l.code }) })) });
  }
  for (const r of plan.aReprendre) {
    const valeur = libelleValeur(r.valeur);
    const im = avec396 ? await immeubleParCle(r.cle) : null;
    if (im !== null && (im.digicode !== null || im.code !== null)) {
      if (memeValeur({ digicode: im.digicode, code: im.code }, r.valeur)) { rapport.dejaRepris.push({ adresse: adresseAffichee(r.adresse), valeur }); continue; }
      rapport.aArbitrer.push({ adresse: adresseAffichee(r.adresse), raison: `l’immeuble porte déjà « ${libelleValeur({ digicode: im.digicode, code: im.code })} »`,
        lots: r.lots.map((id) => ({ id, numero: rows.find((x) => Number(x.id) === id)?.numero ?? null, valeur })) });
      continue;
    }
    if (o.reel) {
      const w = await withTransaction((q) => enregistrerDigicodeDans(q, r.adresse, r.valeur, AUTEUR, 'reprise', null));
      if (!w.ok) { rapport.aArbitrer.push({ adresse: adresseAffichee(r.adresse), raison: w.motif, lots: [] }); continue; }
    }
    rapport.repris.push({ adresse: adresseAffichee(r.adresse), valeur, lots: r.lots });
  }
  return rapport;
}

/** Le rapport en texte (fichier et console). PUR. */
export function texteRapportReprise(r: RapportReprise): string {
  const l = [
    `REPRISE DES DIGICODES SUR LES IMMEUBLES — ${r.reel ? 'RÉELLE (écrite)' : 'À BLANC (rien n’est écrit)'}`,
    `Biens portant un digicode : ${r.biensAvecDigicode}`,
    `${r.reel ? 'Repris' : 'À reprendre'} sur l’immeuble : ${r.repris.length} adresse(s) · déjà repris : ${r.dejaRepris.length} · À ARBITRER : ${r.aArbitrer.length} · sans adresse : ${r.sansAdresse.length}`,
    '', '━━ À ARBITRER (rien n’est choisi ; l’ancien code de chaque bien reste lisible) ━━',
    ...r.aArbitrer.flatMap((a) => [`· ${a.adresse} — ${a.raison}`, ...a.lots.map((x) => `    bien ${x.id}${x.numero ? ` (lot ${x.numero})` : ''} : ${x.valeur}`)]),
    '', `━━ ${r.reel ? 'REPRIS' : 'À REPRENDRE'} ━━`,
    ...r.repris.map((x) => `· ${x.adresse} : ${x.valeur} (biens ${x.lots.join(', ')})`),
    '', '━━ DÉJÀ SUR L’IMMEUBLE ━━', ...r.dejaRepris.map((x) => `· ${x.adresse} : ${x.valeur}`),
    '', `━━ SANS ADRESSE EXPLOITABLE ━━`, r.sansAdresse.length === 0 ? '(aucun)' : `biens ${r.sansAdresse.join(', ')}`,
  ];
  return l.join('\n');
}
