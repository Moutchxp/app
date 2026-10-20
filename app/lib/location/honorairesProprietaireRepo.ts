import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { calculerHonorairesProprietaire, verifierBareme, zoneDuBien, type Bareme, type CalculHonoraires, type RegleZone } from './honorairesProprietaire';
import type { Issue } from './locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — HONORAIRES PROPRIÉTAIRE : BARÈMES DATÉS, ZONE, CALCUL D'UN BIEN (Arno, 20/10/2026). IMPUR. ═══════
 * Règle et calcul : `honorairesProprietaire.ts` (pur). Ici les LECTURES (barèmes, zones, le bien) et l'AJOUT d'un barème par
 * un administrateur (ajout seul, journalisé). Tout est SONDÉ hors transaction : sans la migration 392, rien ne nomme ses
 * tables ni ses colonnes.
 */

export function baremesDisponibles(): Promise<boolean> {
  return colonneExisteMemo('gestion_bareme_honoraires_location', 'depuis');
}

export async function lireBaremes(): Promise<Bareme[]> {
  if (!(await baremesDisponibles())) return [];
  const { rows } = await query<{ id: string; depuis: string; t: string; z: string; a: string; e: string; source: string }>(
    `SELECT id::text, depuis::text, tres_tendue_m2::text AS t, tendue_m2::text AS z, autre_m2::text AS a, etat_des_lieux_m2::text AS e, source
       FROM gestion_bareme_honoraires_location ORDER BY depuis, id`);
  return rows.map((r) => ({ id: Number(r.id), depuis: r.depuis, tresTendue: r.t, tendue: r.z, autre: r.a, etatDesLieux: r.e, source: r.source }));
}

/** Les règles de la table des zones, avec le niveau « très tendue » (faux sans la migration 392). */
export async function reglesZones(): Promise<RegleZone[]> {
  if (!(await colonneExisteMemo('gestion_zone_tendue', 'code'))) return [];
  const tres = (await colonneExisteMemo('gestion_zone_tendue', 'tres_tendue')) ? 'tres_tendue' : 'false';
  const { rows } = await query<{ portee: string; code: string; commune: string | null; tres: boolean }>(
    `SELECT portee, code, commune, ${tres} AS tres FROM gestion_zone_tendue WHERE actif ORDER BY id`);
  return rows.map((r) => ({ portee: r.portee === 'commune' ? 'commune' : 'departement', code: r.code, commune: r.commune, tresTendue: r.tres === true }));
}

/**
 * Le calcul pour le BIEN loué (bloc 2) à la date d'entrée (sans date : aujourd'hui, à Paris — dit à l'écran). La surface est
 * la « Surface Carrez/Boutin » de la fiche du bien. `null` si le bien n'existe pas.
 */
export async function calculHonorairesDuBien(lotId: number, entree: string | null): Promise<CalculHonoraires | null> {
  const carrez = (await colonneExisteMemo('gestion_annuaire_lot', 'surface_carrez_m2')) ? 'surface_carrez_m2::text' : 'NULL::text';
  const { rows } = await query<{ surface: string | null; code_postal: string | null; commune: string | null; jour: string }>(
    `SELECT ${carrez} AS surface, code_postal, commune, ${SQL_AUJOURDHUI_PARIS}::text AS jour FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  const l = rows[0];
  if (l === undefined) return null;
  const date = entree !== null && /^\d{4}-\d{2}-\d{2}$/.test(entree) ? entree : l.jour;
  return calculerHonorairesProprietaire({
    surface: l.surface, zone: zoneDuBien({ codePostal: l.code_postal, commune: l.commune }, await reglesZones()),
    baremes: await lireBaremes(), date, dateSupposee: date !== entree,
  });
}

/** Un NOUVEAU barème (administrateur) : ajouté avec sa date d'effet ; les anciens restent. Journalisé. */
export async function ajouterBareme(brut: Record<string, unknown>, auteur: Auteur): Promise<Issue> {
  if (!(await baremesDisponibles())) return { etat: 'sans_schema' };
  const v = verifierBareme(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const b = v.valeurs;
  return withTransaction(async (q): Promise<Issue> => {
    await q(
      `INSERT INTO gestion_bareme_honoraires_location (depuis, tres_tendue_m2, tendue_m2, autre_m2, etat_des_lieux_m2, source, saisi_par_libelle)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7)`, [b.depuis, b.tresTendue, b.tendue, b.autre, b.etatDesLieux, b.source, auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', 0, 'honoraires_location_bareme', $1, $2, $3, $4)`,
      [`à compter du ${b.depuis} : très tendue ${b.tresTendue}, tendue ${b.tendue}, autre ${b.autre}, état des lieux ${b.etatDesLieux} (€ TTC/m²)`,
        `barème des honoraires de location — ${b.source}`, auteur.id, auteur.libelle]);
    return { etat: 'ok', data: undefined };
  });
}
