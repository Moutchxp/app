import 'server-only';
import { query } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import type { AnnexeLouee } from './annexesGestion';
import type { LienAnnexeAffiche } from './biensRegroupes';

/**
 * ══ 🔴 Arno (25/10/2026, migration 426) — LA RÈGLE DES ANNEXES, LUE EN BASE ═══════════════════════════════════════════════════════════
 * La date de bascule (paramètre de la Location, la plus récente fait foi ; sans la 426 : aucune bascule, tout comme avant), les lots
 * reliés à un lot principal (`gestion_lot_annexe`, détachés compris), et pour une location d'annexe datée de la bascule ou après : son
 * lot principal et sa gestion à la date de signature (le dernier statut daté à cette date, sinon le statut actuel). LECTURE SEULE.
 */
export const basculeDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_parametre_date', 'valeur');

export async function lireBasculeAnnexes(): Promise<string | null> {
  if (!(await basculeDisponible())) return null;
  const r = (await query<{ v: string }>(
    `SELECT valeur::text AS v FROM gestion_location_parametre_date WHERE cle = 'bascule_annexes_gestion' ORDER BY pose_le DESC, id DESC LIMIT 1`)).rows[0];
  return r?.v ?? null;
}

export async function lireIdsAnnexes(): Promise<number[]> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return [];
  return (await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe')).rows.map((r) => Number(r.id));
}

/** La règle complète (date de bascule, annexes) ; sans bascule, la liste des annexes n'est pas lue (rien ne change). */
export async function lireRegleAnnexes(): Promise<{ basculeAnnexes: string | null; annexes: number[] }> {
  const basculeAnnexes = await lireBasculeAnnexes();
  return { basculeAnnexes, annexes: basculeAnnexes === null ? [] : await lireIdsAnnexes() };
}

/** Le lot principal d'une annexe, et s'il était en gestion à la date (« AAAA-MM-JJ »). `null` : pas une annexe. */
export async function principalDeLAnnexe(lotId: number, date: string): Promise<AnnexeLouee | null> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return null;
  const avecTransitions = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const avecStatut = await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien');
  const r = (await query<{ parent: string; libelle: string; statut_date: string | null; statut_actuel: string | null; mandat: string | null }>(
    `SELECT p.id::text AS parent,
            concat_ws(' — ', nullif(btrim(coalesce(p.nature, '')), ''), nullif(btrim(coalesce(p.adresse, '')), '')) AS libelle,
            ${avecTransitions ? `(SELECT t.apres FROM gestion_bien_statut_transition t WHERE t.lot_id = p.id AND t.effet_le <= $2::date ORDER BY t.effet_le DESC, t.id DESC LIMIT 1)` : 'NULL::text'} AS statut_date,
            ${avecStatut ? 'p.statut_bien' : "CASE WHEN p.en_gestion THEN 'en_gestion' END"} AS statut_actuel,
            pr.numero_mandat_gestion AS mandat
       FROM gestion_lot_annexe a JOIN gestion_annuaire_lot p ON p.id = a.parent_id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = p.proprietaire_id
      WHERE a.annexe_id = $1`, [lotId, date])).rows[0];
  if (r === undefined) return null;
  const statut = r.statut_date ?? r.statut_actuel;
  return { parentId: Number(r.parent), libelle: r.libelle || `lot n° ${r.parent}`, principalEnGestion: statut === 'en_gestion', mandat: r.mandat?.trim() || null };
}

/** Les locations d'annexes datées de la bascule ou après, par identifiant de ligne. */
export async function annexesDesLocations(activites: readonly { id: number | string; lotId: number | null; dateSignature: string }[],
  regle: { basculeAnnexes: string | null; annexes: readonly number[] }): Promise<Map<string, AnnexeLouee>> {
  const sortie = new Map<string, AnnexeLouee>();
  if (regle.basculeAnnexes === null) return sortie;
  const ensemble = new Set(regle.annexes);
  for (const a of activites) {
    if (a.lotId === null || !ensemble.has(a.lotId) || a.dateSignature.slice(0, 10) < regle.basculeAnnexes) continue;
    const p = await principalDeLAnnexe(a.lotId, a.dateSignature.slice(0, 10));
    if (p !== null) sortie.set(String(a.id), p);
  }
  return sortie;
}

/**
 * 🔴 Arno (26/10/2026) — Outils de suivi, une ligne par bien : les annexes RATTACHÉES (non détachées) et leur lot principal, avec ce que
 * la bulle « + N annexe(s) » en dit (type, n° de porte ou de place, lot, niveau, adresse). Indépendant de la date de bascule : c'est de
 * l'affichage. Sans la 372 : aucun lien (une ligne par lot, comme avant). LECTURE SEULE.
 */
export async function lireLiensAnnexesAffiches(): Promise<LienAnnexeAffiche[]> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return [];
  const avecLot = await colonneExisteMemo('gestion_annuaire_lot', 'porte');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const { rows } = await query<{ id: string; parent: string; categorie: string | null; etage: string | null; nature: string | null; type_bien: string | null;
    porte: string | null; num_lot_copro: string | null; adresse: string | null; commune: string | null; padresse: string | null; pcommune: string | null }>(
    `SELECT l.id::text AS id, a.parent_id::text AS parent, ${avecLot ? 'l.categorie, l.etage, l.porte, l.num_lot_copro' : 'NULL::text AS categorie, NULL::text AS etage, NULL::text AS porte, NULL::text AS num_lot_copro'},
            l.nature, l.type_bien, l.adresse, l.commune, p.adresse AS padresse, p.commune AS pcommune
       FROM gestion_lot_annexe a JOIN gestion_annuaire_lot l ON l.id = a.annexe_id JOIN gestion_annuaire_lot p ON p.id = a.parent_id
      ${avecDetache ? 'WHERE l.annexe_detachee_le IS NULL' : ''}`);
  const net = (x: string | null): string | null => (x !== null && x.trim() !== '' ? x.trim() : null);
  return rows.map((r) => ({
    id: Number(r.id), parentId: Number(r.parent), categorie: r.categorie, etage: r.etage, nature: r.nature, typeBien: r.type_bien, porte: r.porte,
    numLotCopro: r.num_lot_copro, adresse: r.adresse, commune: r.commune, parentAdresse: r.padresse, parentCommune: r.pcommune,
    // Le libellé du lot principal, écrit comme celui des lignes de gestion (adresse, commune).
    parentLibelle: [net(r.padresse), net(r.pcommune)].filter((x) => x !== null).join(', ') || `Bien n° ${r.parent}`,
  }));
}
