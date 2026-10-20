import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import {
  cleImmeubleAdresse, libelleValeur, memeValeur, mentionDigicode, planReprise, verifierDigicode,
  type AdresseImmeuble, type ValeurDigicode,
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

export type DepuisDigicode = 'fiche_syndic' | 'fiche_bien' | 'nouveau_bien' | 'reprise';

export interface DigicodeLu extends ValeurDigicode {
  /** `immeuble` : la valeur de l'immeuble ; `bien` : l'ANCIENNE valeur propre au bien (l'immeuble n'en a pas encore — reprise
   * « à arbitrer ») ; `null` : rien de connu. */
  source: 'immeuble' | 'bien' | null;
  adresse: AdresseImmeuble;
  /** « Commun à tous les biens du … (N biens) » ; `null` sans adresse exploitable. */
  mention: string | null;
  nbBiens: number;
}

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

interface ImmeubleSql { id: string; digicode: boolean | null; code: string | null }

async function immeubleParCle(cle: string, q: RequeteTx = query, verrou = false): Promise<ImmeubleSql | null> {
  const { rows } = await q<ImmeubleSql>(
    `SELECT id::text, digicode, digicode_code AS code FROM gestion_immeuble WHERE cle_adresse = $1${verrou ? ' FOR UPDATE' : ''}`, [cle]);
  return rows[0] ?? null;
}

/** Le digicode de l'immeuble d'une ADRESSE (fiche immeuble / syndic, « Nouveau bien »). `null` sans la 396. */
export async function lireDigicodeAdresse(a: AdresseImmeuble): Promise<DigicodeLu | null> {
  if (!(await digicodeImmeubleDisponible())) return null;
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return { digicode: null, code: null, source: null, adresse: a, mention: null, nbBiens: 0 };
  const im = await immeubleParCle(cle);
  const nbBiens = (await biensDeLAdresse(a)).length;
  const connu = im !== null && (im.digicode !== null || im.code !== null);
  return { digicode: connu ? im.digicode : null, code: connu ? im.code : null, source: connu ? 'immeuble' : null, adresse: a, mention: mentionDigicode(a, nbBiens), nbBiens };
}

/**
 * Le digicode d'un BIEN : celui de son immeuble ; tant que l'immeuble n'en a pas, l'ancienne valeur du bien reste lisible
 * (`source: 'bien'`). `null` sans la 396 (l'appelant lit alors les colonnes du bien, comme avant).
 */
export async function lireDigicodeDuLot(lotId: number): Promise<DigicodeLu | null> {
  if (!(await digicodeImmeubleDisponible())) return null;
  const { rows } = await query<{ voie: string | null; cp: string | null; commune: string | null; digicode: boolean | null; code: string | null }>(
    'SELECT adresse AS voie, code_postal AS cp, commune, digicode, digicode_code AS code FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  const l = rows[0];
  if (l === undefined) return null;
  const lu = await lireDigicodeAdresse({ voie: l.voie, codePostal: l.cp, commune: l.commune });
  if (lu === null) return null;
  if (lu.source === 'immeuble') return lu;
  const ancien = l.digicode !== null || (l.code ?? '').trim() !== '';
  return ancien ? { ...lu, digicode: l.digicode, code: l.code, source: 'bien' } : lu;
}

/**
 * ÉCRIT le digicode de l'immeuble d'une adresse, DANS la transaction de l'appelant : l'immeuble est créé s'il n'existe pas
 * (adresse seule, sans syndic) ; rien n'est écrit si la valeur ne change pas ; le changement est journalisé.
 * Rend `{ change }` ; lève un refus lisible sur une saisie invalide ou une adresse sans voie.
 */
export async function enregistrerDigicodeDans(q: RequeteTx, a: AdresseImmeuble, brut: { digicode?: unknown; code?: unknown }, auteur: Auteur,
  depuis: DepuisDigicode, lotId: number | null = null): Promise<{ ok: true; change: boolean; immeubleId: number } | { ok: false; motif: string }> {
  const v = verifierDigicode(brut);
  if (!v.ok) return v;
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return { ok: false, motif: 'Adresse incomplète : le digicode se range sur l’immeuble de l’adresse (numéro et voie).' };
  await q(
    `INSERT INTO gestion_immeuble (cle_adresse, voie, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (cle_adresse) DO NOTHING`, [cle, (a.voie ?? '').trim(), a.codePostal, a.commune, auteur.id, auteur.libelle]);
  const im = await immeubleParCle(cle, q, true);
  if (im === null) return { ok: false, motif: 'Immeuble introuvable après sa création.' };
  const avant = { digicode: im.digicode, code: im.code };
  if (memeValeur(avant, v.valeur)) return { ok: true, change: false, immeubleId: Number(im.id) };
  await q('UPDATE gestion_immeuble SET digicode = $2, digicode_code = $3, modifie_le = now(), modifie_par_libelle = $4 WHERE id = $1',
    [Number(im.id), v.valeur.digicode, v.valeur.code, auteur.libelle]);
  await q(
    `INSERT INTO gestion_immeuble_digicode_journal (immeuble_id, avant_digicode, avant_code, apres_digicode, apres_code, depuis, lot_id, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [Number(im.id), avant.digicode, avant.code, v.valeur.digicode, v.valeur.code, depuis, lotId, auteur.id, auteur.libelle]);
  if (lotId !== null) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
             VALUES ('annuaire_lot', $1, 'digicode_immeuble', $2, $3, $4, $5, $6)`,
      [lotId, libelleValeur(avant), libelleValeur(v.valeur), `digicode de l’immeuble ${(a.voie ?? '').trim()} (commun à tous ses biens)`, auteur.id, auteur.libelle]);
  }
  return { ok: true, change: true, immeubleId: Number(im.id) };
}

/** Le même geste, dans sa propre transaction (fiche immeuble / syndic). */
export async function enregistrerDigicode(a: AdresseImmeuble, brut: { digicode?: unknown; code?: unknown }, auteur: Auteur, depuis: DepuisDigicode,
  lotId: number | null = null): Promise<{ ok: true; change: boolean } | { ok: false; motif: string }> {
  if (!(await digicodeImmeubleDisponible())) return { ok: false, motif: 'Le digicode de l’immeuble n’est pas encore installé (migration 396).' };
  return withTransaction((q) => enregistrerDigicodeDans(q, a, brut, auteur, depuis, lotId));
}

/** Le journal d'un immeuble (le plus récent d'abord). */
export async function journalDigicode(a: AdresseImmeuble): Promise<{ le: string; avant: string; apres: string; par: string; depuis: DepuisDigicode }[]> {
  if (!(await digicodeImmeubleDisponible())) return [];
  const cle = cleImmeubleAdresse(a);
  if (cle === null) return [];
  const { rows } = await query<{ le: string; ad: boolean | null; ac: string | null; pd: boolean | null; pc: string | null; par: string; depuis: DepuisDigicode }>(
    `SELECT j.le::text, j.avant_digicode AS ad, j.avant_code AS ac, j.apres_digicode AS pd, j.apres_code AS pc, j.auteur_libelle AS par, j.depuis
       FROM gestion_immeuble_digicode_journal j JOIN gestion_immeuble i ON i.id = j.immeuble_id WHERE i.cle_adresse = $1 ORDER BY j.le DESC, j.id DESC`, [cle]);
  return rows.map((r) => ({ le: r.le, avant: libelleValeur({ digicode: r.ad, code: r.ac }), apres: libelleValeur({ digicode: r.pd, code: r.pc }), par: r.par, depuis: r.depuis }));
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
