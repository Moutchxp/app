import 'server-only';
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { SIGLE_INDICE, libelleTrimestre, lireValeurIndice, TYPES_INDICE, valeurIndiceTexte, verifierNouvelIndice, type IndiceSaisi, type TypeIndice } from './indicesLoyers';

/**
 * ══ 🔴 Arno (25/10/2026, migration 423) — LA TABLE DES INDICES DE RÉVISION (IMPUR : base) ═════════════════════════════════════════════
 * Alimentée par le bloc « Indice des loyers » de Nouveau locataire / Dossier de location (« + Saisir un nouvel indice ») et par l'onglet
 * « Indices » de Paramètres Location (saisie, correction). AJOUT SEUL (déclencheur en base) : une correction est une nouvelle ligne
 * (`remplace_id`) ; la valeur EN VIGUEUR d'un trimestre est sa ligne la plus récente. Pas d'INSEE (décision d'Arno) : rien n'est inventé.
 */
export const MOT_SANS_423 = 'Mise à jour de la base à appliquer (migration 423) : les indices des loyers ne peuvent pas encore être enregistrés.';
export function indicesDisponibles(): Promise<boolean> { return colonneExisteMemo('gestion_location_indice', 'valeur'); }
/** L'indice du bail sur ses conditions d'entrée (423). */
export function indiceDuBailDisponible(): Promise<boolean> { return colonneExisteMemo('gestion_location_conditions_entree', 'revision_le'); }

type Reponse<T = undefined> = { etat: 'ok'; data?: T } | { etat: 'refus'; motif: string; existant?: IndiceSaisi } | { etat: 'indisponible'; motif: string };

/**
 * Les indices EN VIGUEUR (la ligne la plus récente de chaque type + trimestre), avec la date d'entrée la plus récente d'un bail qui
 * l'utilise (les conditions d'entrée EN VIGUEUR de chaque bail : leur ligne la plus récente). Vide sans la 423.
 */
export async function lireIndices(): Promise<IndiceSaisi[]> {
  if (!(await indicesDisponibles())) return [];
  const avecBail = await indiceDuBailDisponible();
  const { rows } = await query<{ type: string; annee: number; trimestre: number; valeur: string; derniere: string | null }>(
    `WITH courant AS (
       SELECT DISTINCT ON (type, annee, trimestre) type, annee, trimestre, valeur FROM gestion_location_indice
        ORDER BY type, annee, trimestre, id DESC)
     SELECT c.type, c.annee, c.trimestre, c.valeur::text AS valeur, ${avecBail ? `(
       SELECT max(b.entree)::text FROM (
         SELECT DISTINCT ON (x.bail_cle) x.bail_id, x.indice_type, x.indice_annee, x.indice_trimestre FROM gestion_location_conditions_entree x
          ORDER BY x.bail_cle, x.id DESC) e
         JOIN gestion_bail b ON b.id = e.bail_id
        WHERE e.indice_type = c.type AND e.indice_annee = c.annee AND e.indice_trimestre = c.trimestre)` : 'NULL::text'} AS derniere
       FROM courant c ORDER BY c.type, c.annee DESC, c.trimestre DESC`);
  return rows.map((r) => ({ type: r.type as TypeIndice, annee: Number(r.annee), trimestre: Number(r.trimestre), valeur: Number(r.valeur), derniereUtilisation: r.derniere }));
}

/** « + Saisir un nouvel indice » / l'onglet Indices : refusé s'il existe déjà (même type + trimestre), avec la valeur existante. */
export async function creerIndice(brut: unknown, auteur: Auteur): Promise<Reponse<IndiceSaisi>> {
  if (!(await indicesDisponibles())) return { etat: 'indisponible', motif: MOT_SANS_423 };
  return withTransaction(async (q) => {
    // Un seul enregistrement à la fois pour la table : deux saisies simultanées du même trimestre ne font jamais deux lignes.
    await q('LOCK TABLE gestion_location_indice IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await q<{ type: string; annee: number; trimestre: number; valeur: string }>(
      `SELECT DISTINCT ON (type, annee, trimestre) type, annee, trimestre, valeur::text AS valeur FROM gestion_location_indice ORDER BY type, annee, trimestre, id DESC`);
    const existants: IndiceSaisi[] = rows.map((r) => ({ type: r.type as TypeIndice, annee: Number(r.annee), trimestre: Number(r.trimestre), valeur: Number(r.valeur), derniereUtilisation: null }));
    const v = verifierNouvelIndice(brut, existants);
    if (!v.ok) return { etat: 'refus', motif: v.motif, ...(v.existant ? { existant: v.existant } : {}) } as const;
    await q(`INSERT INTO gestion_location_indice (type, annee, trimestre, valeur, saisi_par, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
      [v.indice.type, v.indice.annee, v.indice.trimestre, v.indice.valeur, auteur.id, auteur.libelle]);
    return { etat: 'ok', data: { ...v.indice, derniereUtilisation: null } } as const;
  });
}

/** L'onglet Indices : CORRIGER la valeur d'un trimestre — une nouvelle ligne qui remplace la précédente (l'historique reste). */
export async function corrigerIndice(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await indicesDisponibles())) return { etat: 'indisponible', motif: MOT_SANS_423 };
  const b = (brut ?? {}) as Record<string, unknown>;
  const type = (TYPES_INDICE as readonly string[]).includes(String(b.type)) ? b.type as TypeIndice : null;
  const annee = Number(b.annee); const trimestre = Number(b.trimestre);
  const valeur = lireValeurIndice(b.valeur);
  if (type === null || !Number.isInteger(annee) || !Number.isInteger(trimestre)) return { etat: 'refus', motif: 'Indice inconnu.' };
  if (valeur === undefined) return { etat: 'refus', motif: 'Valeur de l’indice : un nombre positif, trois décimales au plus (ex. 146,68).' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; valeur: string }>(
      'SELECT id::text, valeur::text FROM gestion_location_indice WHERE type = $1 AND annee = $2 AND trimestre = $3 ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [type, annee, trimestre]);
    const r = rows[0];
    if (r === undefined) return { etat: 'refus', motif: `L’indice ${SIGLE_INDICE[type]} ${libelleTrimestre(annee, trimestre)} n’existe pas : saisissez-le d’abord.` } as const;
    if (Math.abs(Number(r.valeur) - valeur) < 0.0005) return { etat: 'refus', motif: `La valeur est déjà ${valeurIndiceTexte(valeur)} : rien à corriger.` } as const;
    await q(`INSERT INTO gestion_location_indice (type, annee, trimestre, valeur, remplace_id, motif, saisi_par, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [type, annee, trimestre, valeur, Number(r.id), `correction : ${valeurIndiceTexte(Number(r.valeur))} → ${valeurIndiceTexte(valeur)}`, auteur.id, auteur.libelle]);
    return { etat: 'ok' } as const;
  });
}

/** La valeur EN VIGUEUR d'un trimestre (null : absent). Pour relever la valeur de référence d'un bail à l'enregistrement. */
export async function valeurIndice(q: RequeteTx, type: TypeIndice, annee: number, trimestre: number): Promise<number | null> {
  const { rows } = await q<{ valeur: string }>(
    'SELECT valeur::text FROM gestion_location_indice WHERE type = $1 AND annee = $2 AND trimestre = $3 ORDER BY id DESC LIMIT 1', [type, annee, trimestre]);
  return rows[0] === undefined ? null : Number(rows[0].valeur);
}
