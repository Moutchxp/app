import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { lireBail } from './sortieLocatairesRepo';
import {
  dureeProposee, enZoneTendue, verifierEtatDesLieux, verifierPreavis, type DureeMois, type LignePreavisAccueil, type ModePreavis,
  type PreavisAffiche, type RegleZoneTendue,
} from './preavis';
import { edlsDesOccupations, edlsDisponible } from './edlsRepo';

/**
 * ══ 🔴🔴 LE PRÉAVIS DU LOCATAIRE (Arno, 18/10/2026). IMPUR (base). ═════════════════════════════════════════════════════
 *
 * Règles : `preavis.ts`. Données : migration 383 (`gestion_location_preavis`, `gestion_zone_tendue`), SONDÉE hors
 * transaction — sans elle, rien ne s'écrit (`sans_schema`) et aucun préavis ne s'affiche ; la sortie, elle, fonctionne.
 * 🔴 LE PRÉAVIS NE TOUCHE JAMAIS L'OCCUPATION : le locataire reste occupant, le logement n'est pas vacant. Seule la
 *    sortie validée (par la Gestion) date l'occupation.
 * 🔴 RIEN N'EST EFFACÉ : une correction AJOUTE une ligne et clôt l'ancienne ; une annulation clôt la ligne (verrou en base).
 *    Chaque geste est écrit au journal append-only, auteur figé en texte. Ordre : LIRE (FOR UPDATE) → REFUSER → ÉCRIRE —
 *    `withTransaction` COMMITE au retour normal, un refus est donc rendu AVANT la première écriture.
 */

export type IssuePreavis<T> = { etat: 'ok'; data: T } | { etat: 'refus'; motif: string } | { etat: 'inconnu' } | { etat: 'sans_schema' };

export const preavisDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_preavis', 'date_max');
/** La date d'état des lieux de sortie prévu (migration 384, sur l'occupation). */
export const etatDesLieuxDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_annuaire_occupation', 'etat_des_lieux_prevu_le');

type LignePreavis = { id: string; occupation_id: string; recu_le: string; date_max: string; mode: string; duree_mois: number | null;
  duree_proposee_mois: number | null; motif: string | null; cree_par_libelle: string; cree_le: string };
const CHAMPS = `p.id::text, p.occupation_id::text, p.recu_le::text, p.date_max::text, p.mode, p.duree_mois, p.duree_proposee_mois, p.motif,
  p.cree_par_libelle, p.cree_le::text`;
const versAffiche = (r: LignePreavis): PreavisAffiche & { dureeProposee: number | null } => ({
  id: Number(r.id), occupationId: Number(r.occupation_id), recuLe: r.recu_le, dateMax: r.date_max,
  mode: r.mode === 'date_manuelle' ? 'date_manuelle' : 'mois', dureeMois: r.duree_mois, motif: r.motif,
  creePar: r.cree_par_libelle, creeLe: r.cree_le, dureeProposee: r.duree_proposee_mois,
});

/** Les préavis OUVERTS (ni remplacés, ni annulés) de ces occupations. Sans la migration 383 : aucun. */
export async function preavisOuverts(occupationIds: readonly number[]): Promise<Map<number, PreavisAffiche & { dureeProposee: number | null }>> {
  const m = new Map<number, PreavisAffiche & { dureeProposee: number | null }>();
  if (occupationIds.length === 0 || !(await preavisDisponible())) return m;
  const edl = (await etatDesLieuxDisponible()) ? 'o.etat_des_lieux_prevu_le::text' : 'NULL::text';
  const { rows } = await query<LignePreavis & { edl: string | null }>(
    `SELECT ${CHAMPS}, ${edl} AS edl FROM gestion_location_preavis p JOIN gestion_annuaire_occupation o ON o.id = p.occupation_id
      WHERE p.occupation_id = ANY($1::bigint[]) AND p.remplace_le IS NULL AND p.annule_le IS NULL`, [[...occupationIds]]);
  for (const r of rows) m.set(Number(r.occupation_id), { ...versAffiche(r), etatDesLieuxLe: r.edl });
  return m;
}

/** Les règles « zone tendue » actives, lues en base (jamais une constante). */
export async function reglesZoneTendue(): Promise<RegleZoneTendue[]> {
  if (!(await colonneExisteMemo('gestion_zone_tendue', 'code'))) return [];
  const { rows } = await query<{ portee: string; code: string; commune: string | null }>(
    'SELECT portee, code, commune FROM gestion_zone_tendue WHERE actif ORDER BY id');
  return rows.map((r) => ({ portee: r.portee === 'commune' ? 'commune' : 'departement', code: r.code, commune: r.commune }));
}

export interface PreavisDuBail {
  disponible: boolean;
  meuble: boolean | null;
  zoneTendue: boolean;
  dureeProposee: DureeMois;
  raison: string;
  /** Les locataires du bail (en place), chacun avec son préavis ouvert éventuel. */
  locataires: { occupationId: number; locataireId: number; nom: string; entree: string | null; preavis: (PreavisAffiche & { dureeProposee: number | null }) | null }[];
}

/** Meublé ? La colonne `meuble` (374) si elle existe et est renseignée ; sinon la nature WIPPIMMO (« … meublé … »). */
async function meubleDuLot(lotId: number): Promise<{ meuble: boolean | null; codePostal: string | null; commune: string | null }> {
  const col = (await colonneExisteMemo('gestion_annuaire_lot', 'meuble')) ? 'meuble' : 'NULL::boolean AS meuble';
  const { rows } = await query<{ meuble: boolean | null; nature: string | null; type_bien: string | null; code_postal: string | null; commune: string | null }>(
    `SELECT ${col}, nature, type_bien, code_postal, commune FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  const r = rows[0];
  if (r === undefined) return { meuble: null, codePostal: null, commune: null };
  const texte = `${r.nature ?? ''} ${r.type_bien ?? ''}`.toLowerCase();
  const meuble = r.meuble !== null ? r.meuble : (/meubl/.test(texte) ? true : null);
  return { meuble, codePostal: r.code_postal, commune: r.commune };
}

/** Ce que l'écran de préavis d'un bail doit savoir : durée proposée (et pourquoi), locataires, préavis ouverts. */
export async function preavisDuBail(occupationId: number): Promise<PreavisDuBail | null> {
  const bail = await lireBail(occupationId);
  if (bail === null) return null;
  const lot = await meubleDuLot(bail.lotId);
  const zoneTendue = enZoneTendue(lot, await reglesZoneTendue());
  const p = dureeProposee({ meuble: lot.meuble, zoneTendue });
  const ouverts = await preavisOuverts(bail.locataires.map((l) => l.occupationId));
  return {
    disponible: await preavisDisponible(), meuble: lot.meuble, zoneTendue, dureeProposee: p.duree, raison: p.raison,
    locataires: bail.locataires.map((l) => ({ ...l, preavis: ouverts.get(l.occupationId) ?? null })),
  };
}

/** Le choix de durée reçu de l'écran, contrôlé. */
export function lireChoix(brut: unknown): ModePreavis | null {
  if (brut === null || typeof brut !== 'object') return null;
  const c = brut as Record<string, unknown>;
  if (c.mode === 'mois' && (c.duree === 1 || c.duree === 3)) return { mode: 'mois', duree: c.duree };
  if (c.mode === 'date_manuelle' && typeof c.dateMax === 'string') return { mode: 'date_manuelle', dateMax: c.dateMax };
  return null;
}

async function aujourdhui(q: RequeteTx): Promise<string> {
  const { rows } = await q<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  return rows[0].j;
}

async function journaliser(q: RequeteTx, locataireId: number, action: string, avant: string | null, apres: string | null, commentaire: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
    [locataireId, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

const texteMotif = (m: unknown): string | null => (typeof m === 'string' && m.trim() !== '' ? m.trim() : null);

/** ENREGISTRE UN PRÉAVIS pour une ou plusieurs occupations (les locataires cochés d'un bail). */
export async function enregistrerPreavis(
  d: { occupationIds: readonly number[]; recuLe: unknown; choix: ModePreavis | null; motif?: unknown }, auteur: Auteur,
): Promise<IssuePreavis<{ dateMax: string; preavis: number }>> {
  if (!(await preavisDisponible())) return { etat: 'sans_schema' };
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Cochez au moins un locataire.' };
  // HORS transaction : la durée proposée (et ses fondements), pour l'audit.
  const ctx = await preavisDuBail(ids[0]);
  if (ctx === null) return { etat: 'inconnu' };
  return withTransaction(async (q) => {
    const { rows: occ } = await q<{ id: string; locataire_id: string; entree: string | null; sortie: string | null; nom: string }>(
      `SELECT o.id::text, o.locataire_id::text, o.entree::text, o.sortie::text, l.nom
         FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
        WHERE o.id = ANY($1::bigint[]) ORDER BY o.id FOR UPDATE OF o`, [ids]);
    if (occ.length !== ids.length) return { etat: 'inconnu' as const };
    if (occ.some((o) => o.sortie !== null)) return { etat: 'refus' as const, motif: 'Un des locataires cochés est déjà sorti du logement.' };
    const { rows: deja } = await q<{ occupation_id: string }>(
      `SELECT occupation_id::text FROM gestion_location_preavis WHERE occupation_id = ANY($1::bigint[])
          AND remplace_le IS NULL AND annule_le IS NULL FOR UPDATE`, [ids]);
    if (deja.length > 0) {
      const noms = occ.filter((o) => deja.some((x) => x.occupation_id === o.id)).map((o) => o.nom).join(', ');
      return { etat: 'refus' as const, motif: `Déjà en préavis : ${noms}. Corrigez son préavis plutôt que d’en saisir un second.` };
    }
    const v = verifierPreavis({ recuLe: d.recuLe, choix: d.choix, motif: texteMotif(d.motif), entrees: occ.map((o) => o.entree) }, await aujourdhui(q));
    if (!v.ok) return { etat: 'refus' as const, motif: v.motif };
    const choix = d.choix as ModePreavis;
    for (const o of occ) {
      await q(
        `INSERT INTO gestion_location_preavis (occupation_id, recu_le, mode, duree_mois, date_max, duree_proposee_mois, meuble, zone_tendue, motif, cree_par, cree_par_libelle)
         VALUES ($1, $2::date, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)`,
        [Number(o.id), d.recuLe, choix.mode, choix.mode === 'mois' ? choix.duree : null, v.dateMax, ctx.dureeProposee, ctx.meuble, ctx.zoneTendue,
          texteMotif(d.motif), auteur.id, auteur.libelle]);
      await journaliser(q, Number(o.locataire_id), 'location_preavis_enregistre', null, v.dateMax,
        `préavis reçu le ${d.recuLe as string} — sortie au plus tard le ${v.dateMax} (${choix.mode === 'mois' ? `${choix.duree} mois` : 'date saisie'}`
        + `${choix.mode === 'mois' && choix.duree !== ctx.dureeProposee ? `, au lieu de ${ctx.dureeProposee} mois proposés` : ''})`
        + `${texteMotif(d.motif) ? ` — motif : ${texteMotif(d.motif)}` : ''} — occupation ${o.id}`, auteur);
    }
    return { etat: 'ok' as const, data: { dateMax: v.dateMax, preavis: occ.length } };
  });
}

/** CORRIGE UN PRÉAVIS : une nouvelle ligne, l'ancienne close (jamais modifiée). */
export async function corrigerPreavis(
  d: { preavisId: number; recuLe: unknown; choix: ModePreavis | null; motif?: unknown }, auteur: Auteur,
): Promise<IssuePreavis<{ dateMax: string }>> {
  if (!(await preavisDisponible())) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<LignePreavis & { remplace_le: string | null; annule_le: string | null; duree_proposee_mois: number | null; meuble: boolean | null; zone_tendue: boolean | null }>(
      `SELECT ${CHAMPS}, p.remplace_le::text, p.annule_le::text, p.meuble, p.zone_tendue FROM gestion_location_preavis p WHERE p.id = $1 FOR UPDATE`, [d.preavisId]);
    const p = rows[0];
    if (p === undefined) return { etat: 'inconnu' as const };
    if (p.remplace_le !== null || p.annule_le !== null) return { etat: 'refus' as const, motif: 'Ce préavis a déjà été corrigé ou annulé : rechargez la page.' };
    const { rows: occ } = await q<{ locataire_id: string; entree: string | null; sortie: string | null }>(
      'SELECT locataire_id::text, entree::text, sortie::text FROM gestion_annuaire_occupation WHERE id = $1 FOR UPDATE', [Number(p.occupation_id)]);
    if (occ[0] === undefined) return { etat: 'inconnu' as const };
    if (occ[0].sortie !== null) return { etat: 'refus' as const, motif: 'Ce locataire est déjà sorti : le préavis ne se corrige plus.' };
    const v = verifierPreavis({ recuLe: d.recuLe, choix: d.choix, motif: texteMotif(d.motif), entrees: [occ[0].entree] }, await aujourdhui(q));
    if (!v.ok) return { etat: 'refus' as const, motif: v.motif };
    const choix = d.choix as ModePreavis;
    // Un seul préavis OUVERT par occupation (index unique en base) : on RÉSERVE l'identifiant de la nouvelle ligne, on CLÔT
    // l'ancienne en la faisant pointer vers lui (clé vérifiée en fin de transaction), puis on INSÈRE la nouvelle.
    const { rows: suivant } = await q<{ id: string }>(`SELECT nextval(pg_get_serial_sequence('gestion_location_preavis', 'id'))::text AS id`);
    const nouvelId = Number(suivant[0].id);
    await q('UPDATE gestion_location_preavis SET remplace_le = now(), remplace_par_id = $2 WHERE id = $1 AND remplace_le IS NULL AND annule_le IS NULL',
      [d.preavisId, nouvelId]);
    await q(
      `INSERT INTO gestion_location_preavis (id, occupation_id, recu_le, mode, duree_mois, date_max, duree_proposee_mois, meuble, zone_tendue, motif, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3::date, $4, $5, $6::date, $7, $8, $9, $10, $11, $12)`,
      [nouvelId, Number(p.occupation_id), d.recuLe, choix.mode, choix.mode === 'mois' ? choix.duree : null, v.dateMax, p.duree_proposee_mois, p.meuble, p.zone_tendue,
        texteMotif(d.motif), auteur.id, auteur.libelle]);
    await journaliser(q, Number(occ[0].locataire_id), 'location_preavis_corrige', `reçu le ${p.recu_le}, au plus tard le ${p.date_max}`,
      `reçu le ${d.recuLe as string}, au plus tard le ${v.dateMax}`,
      `préavis corrigé (${choix.mode === 'mois' ? `${choix.duree} mois` : 'date saisie'})${texteMotif(d.motif) ? ` — motif : ${texteMotif(d.motif)}` : ''}`
      + ` — préavis ${p.id} remplacé par ${nouvelId} ; l’ancienne ligne est gardée`, auteur);
    return { etat: 'ok' as const, data: { dateMax: v.dateMax } };
  });
}

/** ANNULE UN PRÉAVIS : la ligne est close (`annule_le`), jamais effacée. */
export async function annulerPreavis(d: { preavisId: number }, auteur: Auteur): Promise<IssuePreavis<{ annule: number }>> {
  if (!(await preavisDisponible())) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; occupation_id: string; date_max: string; remplace_le: string | null; annule_le: string | null }>(
      'SELECT id::text, occupation_id::text, date_max::text, remplace_le::text, annule_le::text FROM gestion_location_preavis WHERE id = $1 FOR UPDATE', [d.preavisId]);
    const p = rows[0];
    if (p === undefined) return { etat: 'inconnu' as const };
    if (p.remplace_le !== null || p.annule_le !== null) return { etat: 'refus' as const, motif: 'Ce préavis a déjà été corrigé ou annulé : rechargez la page.' };
    const { rows: occ } = await q<{ locataire_id: string }>('SELECT locataire_id::text FROM gestion_annuaire_occupation WHERE id = $1', [Number(p.occupation_id)]);
    await q('UPDATE gestion_location_preavis SET annule_le = now(), annule_par_libelle = $2 WHERE id = $1 AND remplace_le IS NULL AND annule_le IS NULL', [d.preavisId, auteur.libelle]);
    if (occ[0] !== undefined) {
      await journaliser(q, Number(occ[0].locataire_id), 'location_preavis_annule', p.date_max, null,
        `préavis annulé (sortie au plus tard le ${p.date_max} n’a plus cours) — préavis ${p.id}, occupation ${p.occupation_id} ; la ligne est gardée`, auteur);
    }
    return { etat: 'ok' as const, data: { annule: Number(p.id) } };
  });
}

// ══ LE BLOC « LOCATAIRES EN PRÉAVIS » DE L'ACCUEIL (Arno, 18/10/2026) — mêmes données, aucune deuxième implémentation ══════

/**
 * Les préavis EN COURS (ouverts, occupation sans sortie), une ligne par préavis : les locataires d'un même bail reçus
 * ensemble avec la même fin (même lot, même entrée, même réception, même date maximale). Sans la migration 383 : aucun.
 */
export async function preavisEnCours(): Promise<{ disponible: boolean; etatDesLieux: boolean; planification: boolean; lignes: LignePreavisAccueil[] }> {
  if (!(await preavisDisponible())) return { disponible: false, etatDesLieux: false, planification: false, lignes: [] };
  const avecEdl = await etatDesLieuxDisponible();
  const { rows } = await query<{ occupation_id: string; locataire_id: string; nom: string; lot_id: string; entree: string | null; recu_le: string;
    date_max: string; adresse: string | null; edl: string | null }>(
    `SELECT p.occupation_id::text, o.locataire_id::text, l.nom, o.lot_id::text, o.entree::text, p.recu_le::text, p.date_max::text,
            nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS adresse,
            ${avecEdl ? 'o.etat_des_lieux_prevu_le::text' : 'NULL::text'} AS edl
       FROM gestion_location_preavis p
       JOIN gestion_annuaire_occupation o ON o.id = p.occupation_id
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
       JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE p.remplace_le IS NULL AND p.annule_le IS NULL AND o.sortie IS NULL
      ORDER BY p.date_max, o.lot_id, l.nom_normalise, o.id`);
  const groupes = new Map<string, LignePreavisAccueil>();
  for (const r of rows) {
    const cle = `${r.lot_id}|${r.entree ?? ''}|${r.recu_le}|${r.date_max}`;
    const g = groupes.get(cle) ?? {
      cle, lotId: Number(r.lot_id), adresse: r.adresse, occupationId: Number(r.occupation_id), occupationIds: [], locataires: [],
      recuLe: r.recu_le, dateMax: r.date_max, etatDesLieuxLe: r.edl,
    };
    g.occupationIds.push(Number(r.occupation_id));
    g.locataires.push({ occupationId: Number(r.occupation_id), locataireId: Number(r.locataire_id), nom: r.nom });
    // Une date d'état des lieux commune au groupe ; si elles divergent, la plus proche.
    if (r.edl !== null && (g.etatDesLieuxLe === null || r.edl < g.etatDesLieuxLe)) g.etatDesLieuxLe = r.edl;
    groupes.set(cle, g);
  }
  // Arno (19/10/2026) — l'EDLS planifié de chaque ligne (migration 385, sondée ; sans elle : aucun).
  const lignes = [...groupes.values()];
  const edls = await edlsDesOccupations(lignes.flatMap((l) => l.occupationIds));
  for (const l of lignes) l.edls = edls.find((x) => x.occupationIds.some((id) => l.occupationIds.includes(id)))?.edls ?? null;
  return { disponible: true, etatDesLieux: avecEdl, planification: await edlsDisponible(), lignes };
}

/**
 * LA DATE D'ÉTAT DES LIEUX DE SORTIE PRÉVU : saisie, modifiée ou EFFACÉE (`date` vide) sur les occupations d'un préavis.
 * LIRE (FOR UPDATE) → REFUSER → ÉCRIRE ; chaque occupation au journal (avant / après, auteur). La date de SORTIE n'est jamais
 * touchée par ce geste.
 */
export async function enregistrerEtatDesLieux(
  d: { occupationIds: readonly number[]; date: unknown }, auteur: Auteur,
): Promise<IssuePreavis<{ date: string | null }>> {
  if (!(await preavisDisponible()) || !(await etatDesLieuxDisponible())) return { etat: 'sans_schema' };
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; locataire_id: string; sortie: string | null; edl: string | null; recu_le: string | null; date_max: string | null }>(
      `SELECT o.id::text, o.locataire_id::text, o.sortie::text, o.etat_des_lieux_prevu_le::text AS edl, p.recu_le::text, p.date_max::text
         FROM gestion_annuaire_occupation o
         LEFT JOIN gestion_location_preavis p ON p.occupation_id = o.id AND p.remplace_le IS NULL AND p.annule_le IS NULL
        WHERE o.id = ANY($1::bigint[]) ORDER BY o.id FOR UPDATE OF o`, [ids]);
    if (rows.length !== ids.length) return { etat: 'inconnu' as const };
    if (rows.some((r) => r.sortie !== null)) return { etat: 'refus' as const, motif: 'Un des locataires est déjà sorti : l’état des lieux prévu ne se modifie plus ici.' };
    if (rows.some((r) => r.recu_le === null || r.date_max === null)) return { etat: 'refus' as const, motif: 'Un des locataires n’est plus en préavis : rechargez la page.' };
    const v = verifierEtatDesLieux(d.date, rows.map((r) => ({ recuLe: r.recu_le as string, dateMax: r.date_max as string })));
    if (!v.ok) return { etat: 'refus' as const, motif: v.motif };
    await q('UPDATE gestion_annuaire_occupation SET etat_des_lieux_prevu_le = $2::date WHERE id = ANY($1::bigint[]) AND sortie IS NULL', [ids, v.date]);
    for (const r of rows) {
      await journaliser(q, Number(r.locataire_id), v.date === null ? 'location_edl_efface' : 'location_edl_prevu', r.edl, v.date,
        v.date === null ? `état des lieux de sortie prévu effacé (était le ${r.edl ?? '—'}) — occupation ${r.id}`
          : `état des lieux de sortie prévu le ${v.date}${r.edl ? ` (au lieu du ${r.edl})` : ''} — occupation ${r.id}`, auteur);
    }
    return { etat: 'ok' as const, data: { date: v.date } };
  });
}
