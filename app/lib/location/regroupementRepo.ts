import { query, type RequeteTx } from '../db/client';
import { estLotParking } from './bienComplet';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { detacherAnnexeDans, regroupementDisponible } from './entretienAnnexeRepo';
import { annexesARattacher, doitReintegrer, libelleLot, refusRattachement, type FicheBien, type LotDeFiche, type PlanBail } from './regroupement';

/**
 * ══ 🔴🔴 UNE FICHE BIEN = LES LOTS LOUÉS ENSEMBLE — LE DÉPÔT (Arno, 17 et 19/10/2026) ═════════════════════════════════
 *
 * LIRE la fiche d'un lot (ses lots, leur état), APPLIQUER le plan d'un bail (fiches autonomes : détachement par LA porte
 * `detacherAnnexeDans`, regroupement de plusieurs lots), RÉINTÉGRER dès que tous les lots d'une fiche d'origine sont loués
 * aux mêmes locataires. Toujours dans la transaction de l'appelant (celle de l'entrée ou de la sortie du locataire), après
 * avoir LU sous verrou (les lots sont verrouillés : deux baux simultanés sur le même bien ne se croisent pas).
 * Le lien annexe → logement (`gestion_lot_annexe`) n'est jamais touché ; rien n'est jamais effacé (les fiches autonomes se
 * closent). Sans les migrations 372 / 379 / 386 : un lot seul, sans annexes, sans fiche autonome — le geste reste possible.
 *
 * 🔌 POINT D'ACCROCHE FUTUR — lot « arborescence automatique » du Drive : à la création d'une fiche autonome (`appliquerPlan`),
 * son dossier et ses raccourcis vers 1 Propriétaire / 2 Diagnostics / 3 Photos / 4 Syndic ; à la réintégration
 * (`reintegrerSiComplet`), le déplacement de ses dossiers sous la fiche d'origine. AUCUNE écriture Drive aujourd'hui.
 */

const annexesDisponibles = (): Promise<boolean> => colonneExisteMemo('gestion_lot_annexe', 'parent_id');
const detachementDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');

type Lecteur = RequeteTx;

interface LigneLot { id: string; categorie: string | null; nature: string | null; type_bien: string | null; etage: string | null; porte: string | null;
  wippimmo_id: string; adresse: string | null; commune: string | null }

async function colonne(c: string): Promise<string> {
  return (await colonneExisteMemo('gestion_annuaire_lot', c)) ? `lo.${c}::text` : 'NULL::text';
}

/** Les lots, avec leur état (locataires en place), VERROUILLÉS si demandé. */
async function lireLots(q: Lecteur, ids: readonly number[], roleDe: (id: number) => 'logement' | 'annexe', verrou: boolean): Promise<LotDeFiche[]> {
  if (ids.length === 0) return [];
  if (verrou) await q('SELECT id FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [[...ids]]);
  const { rows } = await q<LigneLot>(
    `SELECT lo.id::text, ${await colonne('categorie')} AS categorie, lo.nature, lo.type_bien, ${await colonne('etage')} AS etage,
            ${await colonne('porte')} AS porte, lo.wippimmo_id, lo.adresse, lo.commune
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[])`, [[...ids]]);
  const { rows: occ } = await q<{ lot_id: string; locataire_id: string; nom: string }>(
    `SELECT o.lot_id::text, o.locataire_id::text, l.nom FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = ANY($1::bigint[]) AND o.sortie IS NULL ORDER BY l.nom_normalise, o.id`, [[...ids]]);
  return ids.map((id) => {
    const r = rows.find((x) => Number(x.id) === id);
    const role = roleDe(id);
    const occupants = occ.filter((o) => Number(o.lot_id) === id);
    // Arno (24/10/2026) — un parking : catégorie parking/box, ou catégorie vide et nature/type « parking », « garage », « box »… (`estLotParking`).
    const place = estLotParking({ categorie: r?.categorie ?? null, nature: r?.nature ?? null, typeBien: r?.type_bien ?? null });
    return {
      id, role,
      libelle: libelleLot({ categorie: r?.categorie ?? null, nature: r?.nature ?? null, typeBien: r?.type_bien ?? null, porte: r?.porte ?? null, role }),
      type: [r?.nature, r?.type_bien].filter((x) => x && x.trim() !== '').join(' ') || (r?.categorie ?? null),
      etage: r?.etage ?? null, numeroLot: r === undefined || r.wippimmo_id.startsWith('app-') ? null : r.wippimmo_id, porte: r?.porte ?? null, place,
      categorie: r?.categorie ?? null,
      occupants: [...new Set(occupants.map((o) => Number(o.locataire_id)))].sort((a, b) => a - b),
      noms: [...new Set(occupants.map((o) => o.nom))],
    };
  });
}

async function titreDe(q: Lecteur, id: number): Promise<string> {
  const { rows } = await q<{ t: string | null }>(`SELECT nullif(concat_ws(', ', adresse, commune), '') AS t FROM gestion_annuaire_lot WHERE id = $1`, [id]);
  return rows[0]?.t ?? `Bien ${id}`;
}

/**
 * LA FICHE D'UN LOT : la fiche autonome ouverte qui le contient ; sinon, s'il est une annexe détachée, sa fiche seule ; sinon
 * la fiche d'origine (le logement et ses annexes encore avec lui — ni détachées, ni dans une fiche autonome).
 */
export async function lireFiche(q: Lecteur, lotId: number, verrou = false): Promise<FicheBien | null> {
  const { rows: existe } = await q('SELECT 1 FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  if (existe.length === 0) return null;
  const annexes = await annexesDisponibles();
  const detachement = annexes && await detachementDisponible();
  const parentDe = async (id: number): Promise<number | null> => {
    if (!annexes) return null;
    const { rows } = await q<{ p: string }>('SELECT parent_id::text AS p FROM gestion_lot_annexe WHERE annexe_id = $1', [id]);
    return rows[0] === undefined ? null : Number(rows[0].p);
  };
  const parent = await parentDe(lotId);
  const origineId = parent ?? lotId;
  const role = (id: number): 'logement' | 'annexe' => (id === origineId ? 'logement' : 'annexe');
  if (await regroupementDisponible()) {
    const { rows } = await q<{ id: string; tete_id: string; lot_ids: string[] }>(
      `SELECT id::text, tete_id::text, lot_ids::text[] AS lot_ids FROM gestion_bien_regroupement
        WHERE clos_le IS NULL AND $1 = ANY(lot_ids) ORDER BY id DESC LIMIT 1${verrou ? ' FOR UPDATE' : ''}`, [lotId]);
    if (rows[0] !== undefined) {
      const ids = rows[0].lot_ids.map(Number);
      return { origineId, origineLibelle: await titreDe(q, origineId), teteId: Number(rows[0].tete_id), sorte: 'regroupement',
        regroupementId: Number(rows[0].id), lots: await lireLots(q, ids, role, verrou) };
    }
  }
  if (parent !== null && detachement) {
    const { rows } = await q<{ d: boolean }>('SELECT annexe_detachee_le IS NOT NULL AS d FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
    if (rows[0]?.d === true) {
      return { origineId, origineLibelle: await titreDe(q, origineId), teteId: lotId, sorte: 'autonome', regroupementId: null,
        lots: await lireLots(q, [lotId], role, verrou) };
    }
  }
  // La fiche d'origine : le logement et ses annexes encore avec lui.
  let ids = [origineId];
  if (annexes) {
    const { rows } = await q<{ id: string }>(
      `SELECT a.annexe_id::text AS id FROM gestion_lot_annexe a JOIN gestion_annuaire_lot al ON al.id = a.annexe_id
        WHERE a.parent_id = $1 ${detachement ? 'AND al.annexe_detachee_le IS NULL' : ''}
          ${(await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? 'AND al.sorti_portefeuille_le IS NULL' : ''}
        ORDER BY a.annexe_id`, [origineId]);
    ids = [origineId, ...rows.map((r) => Number(r.id))];
  }
  return { origineId, origineLibelle: await titreDe(q, origineId), teteId: origineId, sorte: 'origine', regroupementId: null,
    lots: await lireLots(q, ids, role, verrou) };
}

/** La fiche d'un lot, pour l'écran « Nouveau locataire » (LECTURE SEULE). */
export async function ficheDuBienPourBail(lotId: number): Promise<FicheBien | null> {
  return lireFiche(query as RequeteTx, lotId, false);
}

/** APPLIQUE le plan d'un bail, dans la transaction de l'appelant. Rend les phrases de ce qui a été fait. */
/** Un plan qui regroupe PLUSIEURS lots dans une fiche autonome demande la migration 386. `null` = applicable. */
export async function refusSansRegroupement(plan: PlanBail): Promise<string | null> {
  if (await regroupementDisponible()) return null;
  return plan.actions.some((a) => a.sorte === 'clore' || (a.sorte === 'autonome' && a.lotIds.length > 1))
    ? 'Regrouper plusieurs lots dans une nouvelle fiche bien demande la mise à jour de la base (migration 386).' : null;
}

export async function appliquerPlan(q: RequeteTx, fiche: FicheBien, plan: PlanBail, auteur: Auteur): Promise<string[]> {
  const regroupement = await regroupementDisponible();
  for (const a of plan.actions) {
    if (a.sorte === 'clore') {
      await q(`UPDATE gestion_bien_regroupement SET clos_le = now(), clos_statut = 'remplace', clos_par_libelle = $2 WHERE id = $1 AND clos_le IS NULL`,
        [a.regroupementId, auteur.libelle]);
      continue;
    }
    // Chaque lot sort de la fiche d'origine par LA porte du détachement (marque datée, lien gardé, journal).
    // (Les lots d'une fiche autonome sont déjà détachés : seule la fiche change.)
    for (const id of fiche.sorte === 'origine' ? a.lotIds : []) {
      if (id === fiche.origineId) continue;
      await detacherAnnexeDans(q, id, true, auteur, { motif: a.motif, ficheSeule: false });
    }
    if (regroupement) {
      await q(`INSERT INTO gestion_bien_regroupement (origine_id, tete_id, lot_ids, motif, cree_par, cree_par_libelle)
               VALUES ($1, $2, $3::bigint[], $4, $5, $6)`, [fiche.origineId, a.teteId, a.lotIds, a.motif, auteur.id, auteur.libelle]);
    }
  }
  return plan.recap;
}

/**
 * RÉINTÉGRER, si tous les lots d'une fiche d'origine (le logement ET toutes ses annexes) sont loués aux MÊMES locataires :
 * chaque annexe détachée revient (`detacherAnnexeDans`, motif « reintegration ») et ses fiches autonomes se CLOSENT
 * (« réintégrée ») — jamais effacées, toujours consultables. Rend une phrase par fiche d'origine réunie.
 */
export async function reintegrerSiComplet(q: RequeteTx, lotIds: readonly number[], auteur: Auteur): Promise<string[]> {
  if (lotIds.length === 0 || !(await annexesDisponibles()) || !(await detachementDisponible())) return [];
  const { rows: origines } = await q<{ o: string }>(
    `SELECT DISTINCT coalesce((SELECT a.parent_id FROM gestion_lot_annexe a WHERE a.annexe_id = l.id), l.id)::text AS o
       FROM gestion_annuaire_lot l WHERE l.id = ANY($1::bigint[])`, [[...lotIds]]);
  const messages: string[] = [];
  for (const { o } of origines) {
    const origineId = Number(o);
    const { rows: an } = await q<{ id: string; d: boolean }>(
      `SELECT a.annexe_id::text AS id, al.annexe_detachee_le IS NOT NULL AS d FROM gestion_lot_annexe a JOIN gestion_annuaire_lot al ON al.id = a.annexe_id
        WHERE a.parent_id = $1 ORDER BY a.annexe_id`, [origineId]);
    if (an.length === 0) continue;
    const ids = [origineId, ...an.map((r) => Number(r.id))];
    const lots = await lireLots(q, ids, (id) => (id === origineId ? 'logement' : 'annexe'), true);
    if (!doitReintegrer(lots, an.some((r) => r.d))) {
      /* Arno (21/10/2026) — LE RATTACHEMENT AUTOMATIQUE, annexe par annexe : une annexe DÉTACHÉE louée exactement aux mêmes
         locataires que son lot principal y revient, même si une autre annexe reste louée à part (la réintégration complète,
         ci-dessous, reste celle de toujours). Les autres lots d'une fiche autonome gardent chacun la leur (`scinder`). */
      const principal = lots.find((l) => l.id === origineId);
      const ids = principal === undefined ? [] : annexesARattacher(principal, an.map((r) => ({ id: Number(r.id), detachee: r.d, occupants: lots.find((l) => l.id === Number(r.id))?.occupants ?? [] })));
      for (const id of ids) await detacherAnnexeDans(q, id, false, auteur, { motif: 'automatique' });
      const libelles = lots.filter((l) => ids.includes(l.id)).map((l) => l.libelle);
      if (libelles.length > 0) {
        messages.push(`Rattachement automatique : ${libelles.join(', ')} ${libelles.length > 1 ? 'reviennent' : 'revient'} sous ${await titreDe(q, origineId)} — même locataire.`);
      }
      continue;
    }
    for (const r of an.filter((x) => x.d)) {
      await detacherAnnexeDans(q, Number(r.id), false, auteur, { motif: 'reintegration', scinder: false });
    }
    const detaches = lots.filter((l) => an.some((r) => r.d && Number(r.id) === l.id)).map((l) => l.libelle);
    messages.push(`Réintégration : ${detaches.join(', ')} ${detaches.length > 1 ? 'reviennent' : 'revient'} dans la fiche de ${await titreDe(q, origineId)} — tous ses lots sont loués aux mêmes locataires.`);
  }
  return messages;
}

/**
 * Arno (21/10/2026) — « Rattacher à son lot principal » une annexe DÉTACHÉE : le motif du REFUS (louée à un autre locataire que
 * son lot principal), ou `null` (vacante, ou mêmes locataires). Lu pour griser le lien ; relu sous verrou au moment du geste.
 */
export async function refusRattachementAnnexe(q: Lecteur, annexeId: number, verrou = false): Promise<string | null> {
  const { rows } = await q<{ p: string }>('SELECT parent_id::text AS p FROM gestion_lot_annexe WHERE annexe_id = $1', [annexeId]);
  if (rows[0] === undefined) return null;
  const parentId = Number(rows[0].p);
  const [p, a] = await lireLots(q, [parentId, annexeId], (id) => (id === parentId ? 'logement' : 'annexe'), verrou);
  return refusRattachement(a, { occupants: p.occupants, noms: p.noms, mot: p.libelle });
}

/** Les fiches autonomes d'un lot (ouverte et closes), pour sa fiche : « Issu de », ses lots, « réintégrée dans … ». */
export interface FicheAutonomeAffichee {
  id: number; origineId: number; origineTitre: string; teteId: number; lotIds: number[]; motif: string;
  creeLe: string; statut: 'active' | 'reintegree' | 'remplacee'; closLe: string | null;
}

export async function fichesAutonomesDuLot(lotId: number): Promise<FicheAutonomeAffichee[]> {
  if (!(await regroupementDisponible())) return [];
  const { rows } = await query<{ id: string; origine_id: string; origine: string | null; tete_id: string; lot_ids: string[]; motif: string; cree_le: string;
    clos_statut: string | null; clos_le: string | null }>(
    `SELECT g.id::text, g.origine_id::text, nullif(concat_ws(', ', o.adresse, o.commune), '') AS origine, g.tete_id::text, g.lot_ids::text[] AS lot_ids,
            g.motif, g.cree_le::text, g.clos_statut, g.clos_le::text
       FROM gestion_bien_regroupement g JOIN gestion_annuaire_lot o ON o.id = g.origine_id
      WHERE $1 = ANY(g.lot_ids) OR g.origine_id = $1 ORDER BY g.id DESC`, [lotId]);
  return rows.map((r) => ({
    id: Number(r.id), origineId: Number(r.origine_id), origineTitre: r.origine ?? `Bien ${r.origine_id}`, teteId: Number(r.tete_id),
    lotIds: r.lot_ids.map(Number), motif: r.motif, creeLe: r.cree_le,
    statut: r.clos_statut === null ? 'active' : r.clos_statut === 'reintegre' ? 'reintegree' : 'remplacee', closLe: r.clos_le,
  }));
}
